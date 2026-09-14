// web/src/components/ChatInterface.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, User, Bot, HeartPulse, ShieldCheck } from 'lucide-react';
import { apiClient } from '../services/api';
import { buildComfortResponse } from '../services/wellnessIntelligence';
import { aiConfig } from '../services/aiConfig';

export default function ChatInterface({ userId = null, onMoodLogged }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'ai',
      text: 'Welcome. You can type one line or a full note. What feels heaviest right now?',
      emotion: 'calm',
      timestamp: 'Just now',
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  // Counts completed exchanges so the companion rotates its fillers and
  // drops the archetype opener after the first reply.
  const turnRef = useRef(0);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (event) => {
    event?.preventDefault();
    if (!input.trim() || isTyping) return;

    const userText = input.trim();
    setInput('');

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: userText,
      timestamp: 'Just now',
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const response = await apiClient.sendTextInteraction(userId, userText);
      const emotion = response.moodLog?.emotion || 'calm';
      const confidence = response.moodLog?.details?.confidence || 0.92;
      const { archetypeId, regionId } = aiConfig.getCompanionProfile();
      const comfort = buildComfortResponse({
        text: userText,
        emotion,
        urgency: response.moodLog?.details?.urgency || 'normal',
        topicFlags: response.moodLog?.details?.topicFlags || {},
        mode: 'text',
        archetypeId,
        regionId,
        turn: turnRef.current,
      });
      turnRef.current += 1;

      if (onMoodLogged) onMoodLogged(response.moodLog);

      setMessages((prev) =>
        prev.map((message) => (message.id === userMsg.id ? { ...message, emotion, confidence } : message))
      );

      setTimeout(() => {
        const aiMsg = {
          id: Date.now() + 1,
          sender: 'ai',
          text: `${comfort.message} ${comfort.followUp}`.trim(),
          emotion,
          timestamp: 'Just now',
        };
        setMessages((prev) => [...prev, aiMsg]);
        setIsTyping(false);
      }, 700);
    } catch (error) {
      console.error('Chat error:', error);
      setIsTyping(false);
    }
  };

  const handleChip = (promptText) => {
    setInput(promptText);
  };

  return (
    <div className="chat-shell">
      <div className="experience-panel">
        <div className="experience-panel__header">
          <div>
            <span className="eyebrow">Text Check-In</span>
            <h3>Write what is on your mind.</h3>
            <p>Short messages are enough. Name the pressure, the feeling, or the win.</p>
          </div>

          <div className="experience-panel__status">
            <ShieldCheck size={14} />
            <span>Private by default</span>
          </div>
        </div>

        <div className="chat-feed glass-panel">
          {messages.map((message) => {
            const isUser = message.sender === 'user';
            return (
              <div key={message.id} className={`message-row ${isUser ? 'user' : 'ai'}`}>
                {!isUser && (
                  <div className="message-avatar ai">
                    <Bot size={18} />
                  </div>
                )}

                <div className="message-stack">
                  <div className={`message-bubble ${isUser ? 'user' : 'ai'}`}>
                    {message.text}
                  </div>

                  {isUser && message.emotion && (
                    <div className="message-meta">
                      <span className={`badge-emotion ${message.emotion}`}>
                        <HeartPulse size={10} />
                        {formatLabel(message.emotion)}
                        {message.confidence ? ` ${Math.round(message.confidence * 100)}%` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="message-avatar user">
                    <User size={16} />
                  </div>
                )}
              </div>
            );
          })}

          {isTyping && (
            <div className="message-row ai">
              <div className="message-avatar ai">
                <Bot size={18} />
              </div>
              <div className="message-stack">
                <div className="message-bubble ai">
                  MindGuard is reflecting on what you shared.
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-chip-row">
          {[
            'My workload has felt unmanageable lately',
            'I feel anxious about an upcoming presentation',
            'I achieved my primary milestone today',
            'Need a quick grounding exercise',
          ].map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => handleChip(chip)}
              className="btn-ghost"
            >
              <Sparkles size={11} color="var(--calm-blue)" />
              {chip}
            </button>
          ))}
        </div>

        <form onSubmit={handleSend} className="chat-form">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Type whatever feels important right now..."
            className="glass-input"
          />
          <button type="submit" className="btn-primary" disabled={!input.trim() || isTyping}>
            <Send size={16} />
            <span>Send</span>
          </button>
        </form>

        <p className="chat-footnote">
          One honest sentence is more useful than a perfect explanation.
        </p>
      </div>
    </div>
  );
}

function formatLabel(value) {
  return (value || 'neutral')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
