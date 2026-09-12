import { describe, expect, it } from 'vitest'

import { preferServerPortableHistory } from './portable-history-recovery'
import type { ChatMessage } from './types'

function textMessage(role: 'user' | 'assistant', text: string): ChatMessage {
  return {
    role,
    content: [{ type: 'text', text }],
  }
}

describe('preferServerPortableHistory', () => {
  it('uses the persisted server transcript when it includes the final assistant result', () => {
    const local = {
      sessionKey: 'main',
      messages: [textMessage('user', 'list files')],
    }
    const server = {
      sessionKey: 'main',
      messages: [
        textMessage('user', 'list files'),
        textMessage('assistant', 'README.md\npackage.json'),
      ],
    }

    expect(preferServerPortableHistory(server, local)).toEqual(server)
  })

  it('keeps the local snapshot when the server has not caught up', () => {
    const local = {
      sessionKey: 'main',
      messages: [
        textMessage('user', 'list files'),
        textMessage('assistant', 'partial'),
      ],
    }
    const server = {
      sessionKey: 'main',
      messages: [textMessage('user', 'list files')],
    }

    expect(preferServerPortableHistory(server, local)).toEqual(local)
  })
})
