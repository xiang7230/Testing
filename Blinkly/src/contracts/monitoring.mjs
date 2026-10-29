export const MONITORING_STATES = Object.freeze(['IDLE','STARTING','MONITORING','PAUSED','ON_BREAK','ERROR','COMPLETED']);
export const MONITORING_ACTIONS = Object.freeze(['start','started','pause','resume','startBreak','completeBreak','snooze','endSession','cameraError','retry']);
// Dev 5 owns all state transitions. Dev 1 only displays the state and calls handlers.
export const EVENT_TYPES = Object.freeze([
  'SESSION_STARTED','SESSION_PAUSED','SESSION_RESUMED','BLINK_ALERT',
  'POSSIBLE_EYE_RUBBING','DISTANCE_WARNING','BREAK_STARTED','BREAK_COMPLETED',
  'ALERT_SNOOZED','BRIGHTNESS_SUGGESTED','SESSION_ENDED',
]);
