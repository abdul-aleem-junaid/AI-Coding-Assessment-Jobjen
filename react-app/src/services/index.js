// src/services/index.js
//
// Barrel file — re-exports every service so components can import from a
// single path instead of individual files:
//
//   import { validateSession, submitAssessment } from '../services'

export { validateSession, getAssessmentConfig } from './assessment.service'
export { sendChatMessage }                       from './chat.service'
export { submitAssessment, saveDraft }           from './submission.service'
