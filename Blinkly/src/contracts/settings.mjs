export const DEFAULT_SETTINGS = Object.freeze({
  notificationType: 'popup',
  breakDurationMinutes: 5,
  snoozeDurationMinutes: 10,
  reminderIntervalMinutes: 30,
  brightnessEnabled: false,
  preferredBrightness: 60,
  faceTrackingEnabled: true,
  handTrackingEnabled: true,
});

export function validateSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) 
    throw new Error('Settings must be an object');
  const result = { ...DEFAULT_SETTINGS, ...input };
  const allowed = Object.keys(DEFAULT_SETTINGS);

  for (const key of Object.keys(input)) 
    if (!allowed.includes(key)) 
      throw new Error(`Unknown setting: ${key}`);

  if (!['popup', 'system'].includes(result.notificationType)) 
    throw new Error('notificationType must be popup or system');

  for (const key of ['breakDurationMinutes', 'snoozeDurationMinutes', 'reminderIntervalMinutes']) {
    if (!Number.isInteger(result[key]) || result[key] < 1 || result[key] > 120) 
      throw new Error(`${key} must be 1-120 minutes`);
  }
  if (!Number.isInteger(result.preferredBrightness) || result.preferredBrightness < 20 || result.preferredBrightness > 90) 
    throw new Error('preferredBrightness must be 20-90');
  
  for (const key of ['brightnessEnabled', 'faceTrackingEnabled', 'handTrackingEnabled']) 
    if (typeof result[key] !== 'boolean') 
      throw new Error(`${key} must be a boolean`);

  return result;
}
