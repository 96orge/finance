// Shared mocks for the online features. Every external service is mocked in tests:
// they never reach the real internet or spend API credit.

export const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

export function json(route, body, status = 200) {
    return route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

// Answer CORS preflights, hand everything else to `handler`.
export async function mock(page, pattern, handler) {
    await page.route(pattern, (route) => route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: CORS })
        : handler(route));
}

export function claudeMessage(text) {
    return {
        id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
        content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 }
    };
}

export function claudeStream(text) {
    const events = [
        ['message_start', { type: 'message_start', message: { ...claudeMessage(''), content: [], stop_reason: null } }],
        ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
        ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
        ['content_block_stop', { type: 'content_block_stop', index: 0 }],
        ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } }],
        ['message_stop', { type: 'message_stop' }],
    ];
    return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

/** Read the app's saved state (what's in localStorage). */
export const storedState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('96orge_budget_state')));
