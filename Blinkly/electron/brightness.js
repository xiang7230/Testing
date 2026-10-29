import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

// Read only: unsupported external displays return an unavailable result.
export async function getBrightness() {
  try {
    let output;
    if (process.platform === 'win32') {
      const result = await run(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '$b = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Where-Object Active | Select-Object -First 1; if ($null -eq $b) { exit 1 }; Write-Output $b.CurrentBrightness',
        ],
        { timeout: 15000 },
      );
      output = result.stdout;
    } else if (process.platform === 'darwin') {
      const result = await run(
        '/usr/bin/swift',
        [
          '-e',
          `
import Foundation
import CoreGraphics
import Darwin
let library = dlopen("/System/Library/PrivateFrameworks/DisplayServices.framework/DisplayServices", RTLD_LAZY)
typealias ReadBrightness = @convention(c) (UInt32, UnsafeMutablePointer<Float>) -> Int32
if let library = library, let symbol = dlsym(library, "DisplayServicesGetBrightness") {
  let read = unsafeBitCast(symbol, to: ReadBrightness.self)
  var value: Float = 0
  if read(CGMainDisplayID(), &value) == 0 { print(value * 100) } else { exit(1) }
} else { exit(1) }
`,
        ],
        { timeout: 30000 },
      );
      output = result.stdout;
    } else {
      return {
        supported: false,
        value: null,
        reason: 'Brightness reading is unavailable on this platform.',
      };
    }
    const value = Number(output.trim());
    if (!output.trim() || !Number.isFinite(value) || value < 0 || value > 100)
      throw new Error('Invalid reading');
    return { supported: true, value: Math.round(value) };
  } catch {
    return {
      supported: false,
      value: null,
      reason:
        'Unable to read this display’s brightness. Some displays or system configurations are unsupported.',
    };
  }
}


export async function setBrightness(value) {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new Error('Brightness must be an integer from 0 to 100');
  }

  if (process.platform !== 'win32') {
    return {
      supported: false,
      value: null,
      reason: 'Brightness adjustment is not supported on this platform.',
    };
  }

  const command = [
    '$monitor = Get-CimInstance -Namespace root/WMI',
    '-ClassName WmiMonitorBrightnessMethods',
    '-ErrorAction Stop',
    '| Where-Object Active',
    '| Select-Object -First 1;',
    'if ($null -eq $monitor) { throw "No supported display" };',
    '$result = Invoke-CimMethod -InputObject $monitor',
    '-MethodName WmiSetBrightness',
    `-Arguments @{ Brightness = [byte]${value}; Timeout = [uint32]0 }`,
    '-ErrorAction Stop;',
    'if ($result.ReturnValue -ne 0) { throw "Brightness write failed" }',
  ].join(' ');

  try {
    await run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        command,
      ],
      { timeout: 15000 },
    );

    const result = await getBrightness();

    if (!result.supported) {
      return {
        supported: false,
        value: null,
        reason: 'Brightness changed but could not be verified.',
      };
    }

    return {
      supported: true,
      value: result.value,
    };
  } catch (error) {
    return {
      supported: false,
      value: null,
      reason: 'Unable to adjust this display through Windows WMI.',
    };
  }
}
