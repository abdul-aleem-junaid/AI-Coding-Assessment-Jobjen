// src/services/chat.service.js
//
// API calls for the AI assistant chat panel.
//   • sendMessage  — send a candidate message and receive an AI reply
//
// ─── INTEGRATION CHECKLIST ────────────────────────────────────────────────────
//  1. Replace the placeholder endpoint with the real one from the backend.
//  2. If streaming (SSE / chunked transfer) is needed, swap the axios call for
//     a fetch-based stream reader and update the ChatPanel adapter accordingly.
//  3. The ChatModelAdapter in ChatPanel.jsx calls this function.
// ─────────────────────────────────────────────────────────────────────────────

import apiClient from './apiClient'

/**
 * Send a chat message to the AI assistant.
 *
 * @param {{
 *   message: string,         // candidate's question
 *   history: Array<{role: 'user'|'assistant', content: string}>,
 *   assessmentContext?: string, // optional notebook snippet for RAG
 * }} payload
 *
 * @returns {Promise<{
 *   reply: string,           // assistant's response text
 *   sources?: string[],      // optional cited sources
 * }>}
 */
export async function sendChatMessage(payload) {
  // TODO: replace with real endpoint once backend confirms URL
  const { data } = await apiClient.post('/chat/message', payload)
  return data
}
