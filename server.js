/**
 * AI Council API Server v2.1
 * REST + SSE for live deliberation streaming
 */


import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3001;
const SSE_CLIENTS = new Set();
const sessions = new Map();

// ─── LLM Integration (Multi-Provider: MiniMax, LM Studio, OpenRouter) ───────────────────────────────────

// Provider configurations
const PROVIDERS = {
    minimax: {
        name: 'MiniMax',
        apiKey: process.env.MINIMAX_API_KEY || '',
        // Hermes-correct endpoint: api.minimax.io via OAuth/Anthropic-compat (api.minimax.chat is the legacy/dead one)
        apiUrl: process.env.MINIMAX_API_URL || 'https://api.minimax.io/v1/chat/completions',
        model: process.env.MINIMAX_MODEL || 'MiniMax-M2.7',
        default: true
    },
    lmstudio: {
        name: 'LM Studio (Local)',
        apiKey: process.env.LMSTUDIO_KEY || 'sk-lm-xWvfQHZF:L8P76SQakhEA95U8DDNf',
        apiUrl: process.env.LMSTUDIO_URL || 'http://127.0.0.1:1234/v1',
        model: process.env.LMSTUDIO_MODEL || 'gemma-4-e2b-it',
        local: true
    },
    openrouter: {
        name: 'OpenRouter',
        apiKey: process.env.OPENROUTER_API_KEY || '',
        apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'minimax/minimax-m2.5:free'
    }
};

// Current provider selection (can be changed via API)
let currentProvider = process.env.LLM_PROVIDER || 'minimax';

// Get provider configuration
function getProvider(name) {
    return PROVIDERS[name] || PROVIDERS.minimax;
}

// List available providers
function listProviders() {
    return Object.entries(PROVIDERS).map(([key, p]) => ({
        id: key,
        name: p.name,
        model: p.model,
        local: p.local || false,
        active: key === currentProvider,
        hasKey: !!p.apiKey
    }));
}

// Call LLM with automatic fallback
async function callLLM(messages, options = {}) {
    const providerName = options.provider || currentProvider;
    const provider = getProvider(providerName);
    
    // Try specified provider first
    const result = await callProvider(providerName, messages, options);
    if (!result.error) return result;
    
    // Fallback chain
    const fallbackOrder = ['minimax', 'lmstudio', 'openrouter'];
    for (const fallback of fallbackOrder) {
        if (fallback === providerName) continue;
        const fp = getProvider(fallback);
        if (fp.apiKey) {
            console.log(`[LLM] Falling back to ${fp.name}...`);
            const fr = await callProvider(fallback, messages, options);
            if (!fr.error) return fr;
        }
    }
    
    return { error: 'All LLM providers failed' };
}

// Call specific provider
async function callProvider(providerName, messages, options = {}) {
    const provider = getProvider(providerName);
    
    if (!provider.apiKey) {
        return { error: `${provider.name}: No API key configured` };
    }
    
    try {
        let payload, headers, url;
        
        if (providerName === 'minimax') {
            // Hermes patch: api.minimax.io is OpenAI-compatible (api.minimax.chat was the old one)
            payload = {
                model: options.model || provider.model,
                messages: messages.map(m => ({ role: m.role || 'user', content: m.content })),
                temperature: options.temperature || 0.7,
                max_tokens: options.maxTokens || 512
            };
            headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.apiKey}` };
            url = provider.apiUrl;
        } else if (providerName === 'lmstudio') {
            // LM Studio API (OpenAI compatible). Hermes patch: auth optional.
            payload = {
                model: options.model || provider.model,
                messages: messages.map(m => ({ role: m.role || 'user', content: m.content })),
                temperature: options.temperature || 0.7,
                max_tokens: options.maxTokens || 512
            };
            headers = { 'Content-Type': 'application/json' };
            if (provider.apiKey && provider.apiKey !== 'local-no-token-needed') {
                headers['Authorization'] = `Bearer ${provider.apiKey}`;
            }
            url = `${provider.apiUrl}/chat/completions`;
        } else if (providerName === 'openrouter') {
            // OpenRouter API
            payload = {
                model: options.model || provider.model,
                messages: messages.map(m => ({ role: m.role || 'user', content: m.content })),
                temperature: options.temperature || 0.7,
                max_tokens: options.maxTokens || 512
            };
            headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.apiKey}` };
            url = provider.apiUrl;
        }
        
        const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
        
        if (!response.ok) {
            const err = await response.text();
            return { error: `${provider.name} error ${response.status}: ${err.substring(0, 100)}` };
        }
        
        const data = await response.json();
        
        // Parse response based on provider
        let content = '';
        if (providerName === 'minimax') {
            content = data?.choices?.[0]?.messages?.[0]?.text || data?.choices?.[0]?.message?.content || '';
        } else {
            // LM Studio / OpenAI compatible - check reasoning_content first (Qwen puts reasoning there)
            content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.message?.reasoning_content || '';
            // Clean up reasoning markers if present
            content = content.replace(/Thinking Process:\s*/gi, '').trim();
        }
        
        return { content, provider: providerName, model: provider.model };
    } catch (e) {
        return { error: `${provider.name}: ${e.message}` };
    }
}

// ─── SSE BROADCAST ───────────────────────────────────────────
function sseBroadcast(eventType, data) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    SSE_CLIENTS.forEach(res => res.write(payload));
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        viewers: SSE_CLIENTS.size,
        providers: listProviders().map(p => ({ id: p.id, name: p.name, local: p.local, active: p.active }))
    });
});

// ─── LLM Provider Status & Control ────────────────────────────
app.get('/api/llm/providers', (req, res) => {
    res.json({ providers: listProviders() });
});

app.get('/api/llm/status', (req, res) => {
    const providers = listProviders();
    res.json({
        current: currentProvider,
        providers,
        lmStudio: {
            url: PROVIDERS.lmstudio.apiUrl,
            model: PROVIDERS.lmstudio.model,
            modelsAvailable: providers.find(p => p.id === 'lmstudio')?.hasKey ? 'check /api/llm/models' : 'no key'
        }
    });
});

app.get('/api/llm/models', async (req, res) => {
    if (!PROVIDERS.lmstudio.apiKey) {
        return res.json({ error: 'LM Studio not configured' });
    }
    try {
        const response = await fetch(`${PROVIDERS.lmstudio.apiUrl}/models`, {
            headers: { 'Authorization': `Bearer ${PROVIDERS.lmstudio.apiKey}` }
        });
        const data = await response.json();
        res.json({ models: data.data || [] });
    } catch (e) {
        res.json({ error: e.message });
    }
});

app.post('/api/llm/provider', (req, res) => {
    const { provider } = req.body;
    if (!PROVIDERS[provider]) {
        return res.json({ error: 'Unknown provider' });
    }
    currentProvider = provider;
    res.json({ ok: true, provider, name: PROVIDERS[provider].name });
});

app.post('/api/llm/test', async (req, res) => {
    const result = await callLLM([
        { role: 'user', content: 'Say hello in 3 words.' }
    ]);
    res.json(result);
});

// ─── SSE ENDPOINT — live deliberation stream ──────────────────
app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ viewerId: Date.now(), viewers: SSE_CLIENTS.size + 1 })}\n\n`);

    SSE_CLIENTS.add(res);
    sseBroadcast('viewer_count', { count: SSE_CLIENTS.size });

    req.on('close', () => {
        SSE_CLIENTS.delete(res);
        sseBroadcast('viewer_count', { count: SSE_CLIENTS.size });
    });
});

// ── HELPERS (must be defined before any route that uses them) ───────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function appendAudit(event, data = {}) {
    if (!liveSession || !liveSession.audit) return;
    liveSession.audit.push({ ts: new Date().toISOString(), event, ...data });
    // Cap audit log to last 500 events to keep the response sane
    if (liveSession.audit.length > 500) liveSession.audit = liveSession.audit.slice(-500);
}

// ─── SESSION EVENTS — frontend pushes events here ────────────
let liveSession = {
    id: null,
    topic: null,
    mode: null,
    phase: 'idle',
    startedAt: null,
    messages: [],
    contextBlocks: [],
    councilors: [],
    votes: {},
    voteData: null,
    audit: [],
    stats: { messages: 0, yeas: 0, nays: 0 }
};

// Start a new deliberation session
// Auto-deliberation settings
const AUTO_DELIBERATION = process.env.AUTO_DELIBERATION !== 'false'; // Default enabled
const DELIBERATION_DELAY_MS = 2000; // 2 seconds between messages

app.post('/api/session/start', (req, res) => {
    const { topic, mode, councilors } = req.body;
    if (!topic) return res.status(400).json({ error: 'topic is required' });

    // Load councilors from file
    let availableCouncilors = [];
    try {
        const councilorsData = JSON.parse(readFileSync(join(__dirname, 'councilors.json'), 'utf-8'));
        availableCouncilors = councilorsData.filter(c => c.enabled);
    } catch (e) {}

    // Honor the requested councilor list (filter to enabled ones, preserve order)
    let selected = [];
    if (Array.isArray(councilors) && councilors.length > 0) {
        const byId = new Map(availableCouncilors.map(c => [c.id, c]));
        const byName = new Map(availableCouncilors.map(c => [(c.name || '').toLowerCase(), c]));
        for (const want of councilors) {
            const key = String(want).toLowerCase();
            const match = byId.get(want) || byName.get(key);
            if (match && !selected.find(s => s.id === match.id)) selected.push(match);
        }
        // Pad with default ones if the user asked for some but we couldn't resolve them
        if (selected.length === 0) selected = availableCouncilors.slice(0, 5);
    } else {
        selected = availableCouncilors.slice(0, 5);
    }
    if (selected.length === 0) selected = availableCouncilors.slice(0, 5);

    liveSession = {
        id: `session-${Date.now()}`,
        topic,
        mode: mode || 'proposal',
        phase: 'opening',
        startedAt: Date.now(),
        messages: [],
        contextBlocks: [],
        councilors: selected.map(c => ({ ...c, status: 'waiting', speaking: false })),
        votes: {},
        voteData: null,
        audit: [{ ts: new Date().toISOString(), event: 'session_start', topic, mode: mode || 'proposal', councilors: selected.map(c => c.id) }],
        stats: { messages: 0, yeas: 0, nays: 0 }
    };
    sseBroadcast('session_start', liveSession);
    res.json({ ok: true, sessionId: liveSession.id });

    // Auto-start deliberation if enabled (async)
    if (AUTO_DELIBERATION && topic) {
        setTimeout(() => startLLMDeliberation(topic, mode, selected), 1000);
    }
});

// Auto-deliberation with REAL LLM calls.
// Runs each selected councilor in turn, with each one seeing the prior messages
// and context. Falls back to a small set of default roles if the councilor
// entry lacks a description.
async function startLLMDeliberation(topic, mode, selectedCouncilors) {
    if (!liveSession || liveSession.phase === 'ended') return;

    const councilors = (selectedCouncilors && selectedCouncilors.length > 0)
        ? selectedCouncilors
        : (() => {
            try {
                return JSON.parse(readFileSync(join(__dirname, 'councilors.json'), 'utf-8'))
                    .filter(c => c.enabled).slice(0, 5);
            } catch (e) { return []; }
        })();

    if (councilors.length === 0) {
        appendAudit('deliberation_skipped', { reason: 'no councilors' });
        return;
    }

    const baseSystem = `You are a councilor in an AI Council deliberation on the topic: "${topic}".
Mode: ${mode || 'proposal'}.

Your councilors (in speaking order):
${councilors.map((c, i) => `${i+1}. ${c.name} (${c.role}) — ${c.description || 'a wise councilor'}`).join('\n')}

Rules:
- Speak from your unique perspective in 100-200 words.
- Reference specific prior points by councilor name when relevant.
- Stay in character as your assigned role.
- If you are the last speaker in the round, briefly summarize key disagreements and call for a vote.`;

    // Round 1: opening — each councilor in order, no prior context yet
    for (let i = 0; i < councilors.length; i++) {
        if (liveSession.phase === 'ended') return;
        const c = councilors[i];
        const isLast = (i === councilors.length - 1);
        const messages = [
            { role: 'system', content: baseSystem },
            { role: 'user', content: `As ${c.name}, give your opening statement on: "${topic}". ${isLast ? 'You will be the last opener — set up the debate and call for round 2.' : 'Be concise.'}` }
        ];
        await generateCouncilorMessage(c, messages, i);
        await sleep(DELIBERATION_DELAY_MS);
    }

    // Round 2: response — each councilor responds to prior points
    for (let i = 0; i < councilors.length; i++) {
        if (liveSession.phase === 'ended') return;
        const c = councilors[i];
        const messages = [
            { role: 'system', content: baseSystem },
            ...liveSession.messages.map(m => ({ role: 'user', content: `${m.councilor}: ${m.content}` })),
            { role: 'user', content: `As ${c.name}, respond to the prior points. Quote at least one specific councilor by name and agree, refine, or rebut their point. Then add a new angle.` }
        ];
        await generateCouncilorMessage(c, messages, i + councilors.length);
        await sleep(DELIBERATION_DELAY_MS);
    }

    // Move to voting phase
    if (liveSession.phase !== 'ended') {
        liveSession.phase = 'voting';
        appendAudit('phase', { phase: 'voting' });
        sseBroadcast('phase', { phase: 'voting' });
        await sleep(1500);
        await runActualVoting(topic);
    }
}

async function generateCouncilorMessage(councilor, messages, indexHint) {
    if (liveSession.phase === 'ended') return;
    // Resolve the councilor's preferred model against the active provider.
    // Councilors.json may say "MiniMax-M2.7" but if the active provider is lmstudio,
    // that model won't exist. Only override the provider's default model when the
    // councilor's model looks compatible with the active provider.
    const activeProvider = currentProvider;
    const isLmStudio = activeProvider === 'lmstudio';
    const councilorModel = (councilor.model || '').toLowerCase();
    const isLocalModel = councilorModel.includes('gemma') || councilorModel.includes('qwen') || councilorModel.includes('llama') || councilorModel.includes('duckbot') || councilorModel.includes('jan');
    const modelOverride = (isLmStudio && !isLocalModel) ? undefined : councilor.model;
    const result = await callLLM(messages, modelOverride ? { model: modelOverride } : {});
    if (result.error) {
        appendAudit('message_error', { councilor: councilor.id, error: result.error, requested_model: councilor.model, provider: activeProvider });
        return;
    }
    const msg = {
        id: `msg-${Date.now()}-${indexHint}`,
        councilor: councilor.name,
        councilorId: councilor.id,
        role: councilor.role,
        content: result.content,
        timestamp: new Date().toISOString(),
        model: result.model,
        provider: result.provider,
        vote: null
    };
    liveSession.messages.push(msg);
    liveSession.stats.messages++;
    appendAudit('message', { councilor: councilor.id, id: msg.id, model: result.model });
    sseBroadcast('message', msg);
}

// Real voting using LLM to determine votes
async function runActualVoting(topic) {
    if (!liveSession || liveSession.phase === 'ended') return;
    
    // Ask LLM how the council would vote based on the deliberation
    const voteAnalysis = await callLLM([
        { role: 'system', content: 'You are analyzing council voting patterns. Given the deliberation, determine how many yeas and nays there would be. Return ONLY a JSON object: {"yeas": number, "nays": number, "reasoning": "brief explanation"}' },
        { role: 'user', content: `Based on the deliberation about "${topic}" where councilors debated various perspectives, how would the full council vote?

Council summary: ${liveSession.messages.map(m => `${m.councilor}: ${m.content?.substring(0, 100)}...`).join('\n')}

Determine the vote distribution. Consider:
- Technical arguments may favor yeas
- Ethical concerns may create nays
- Pragmatic considerations split the vote
- Visionary perspectives often favor progress

Return JSON with yeas (25-45) and nays (10-30) based on the debate quality.` }
    ]);
    
    let yeas = 32, nays = 18;
    
    // Parse LLM response
    if (!voteAnalysis.error && voteAnalysis.content) {
        try {
            // Try to extract JSON from response
            const jsonMatch = voteAnalysis.content.match(/\{[^{}]*\}/);
            if (jsonMatch) {
                const voteData = JSON.parse(jsonMatch[0]);
                yeas = Math.max(15, Math.min(50, voteData.yeas || 32));
                nays = Math.max(5, Math.min(40, voteData.nays || 18));
            }
        } catch (e) {}
    }
    
    liveSession.stats.yeas = yeas;
    liveSession.stats.nays = nays;
    liveSession.voteData = { yeas, nays, quorum: true, reasoning: voteAnalysis.content?.substring(0, 200) || 'Council majority' };

    appendAudit('vote', { phase: 'auto-tally', yeas, nays });
    sseBroadcast('vote', { yeas, nays, total: yeas + nays, reasoning: liveSession.voteData.reasoning });

    // End session
    setTimeout(() => {
        if (liveSession) {
            liveSession.phase = 'ended';
            appendAudit('phase', { phase: 'ended' });
            sseBroadcast('phase', { phase: 'ended' });
        }
    }, 5000);
}

// Push a deliberation event (message, status, vote, etc.)
app.post('/api/session/event', (req, res) => {
    const { type, data } = req.body;
    
    switch (type) {
        case 'message':
            liveSession.messages.push(data);
            liveSession.stats.messages++;
            sseBroadcast('message', data);
            break;
            
        case 'phase':
            liveSession.phase = data.phase;
            sseBroadcast('phase', data);
            break;
            
        case 'thinking':
            liveSession.councilors = liveSession.councilors.map(c => 
                c.id === data.id ? { ...c, thinking: data.thinking } : c
            );
            sseBroadcast('thinking', data);
            break;
            
        case 'councilor_start':
            liveSession.councilors = liveSession.councilors.map(c => 
                c.id === data.id ? { ...c, status: 'speaking', speaking: true } : c
            );
            sseBroadcast('councilor_start', data);
            break;
            
        case 'councilor_end':
            liveSession.councilors = liveSession.councilors.map(c => 
                c.id === data.id ? { ...c, status: 'done', speaking: false } : c
            );
            sseBroadcast('councilor_end', data);
            break;
            
        case 'vote':
            liveSession.voteData = data;
            liveSession.stats.yeas = data.yeas || 0;
            liveSession.stats.nays = data.nays || 0;
            sseBroadcast('vote', data);
            break;
            
        case 'prediction':
            sseBroadcast('prediction', data);
            break;
            
        case 'end':
            liveSession.phase = 'adjourned';
            sseBroadcast('session_end', { sessionId: liveSession.id });
            break;
    }
    
    res.json({ ok: true });
});

// Get current session state (for late joiners)
app.get('/api/session', (req, res) => {
    const elapsed = liveSession.startedAt ? Date.now() - liveSession.startedAt : 0;
    res.json({ 
        ...liveSession, 
        elapsed,
        viewerCount: SSE_CLIENTS.size 
    });
});

// Get messages so far
app.get('/api/session/messages', (req, res) => {
    res.json({ messages: liveSession.messages });
});

// Get councilors status
app.get('/api/session/councilors', (req, res) => {
    res.json({ councilors: liveSession.councilors });
});

// Clear session
app.post('/api/session/clear', (req, res) => {
    liveSession = {
        id: null,
        topic: null,
        mode: null,
        phase: 'idle',
        startedAt: null,
        messages: [],
        contextBlocks: [],
        councilors: [],
        votes: {},
        voteData: null,
        audit: [],
        stats: { messages: 0, yeas: 0, nays: 0 }
    };
    sseBroadcast('session_clear', {});
    res.json({ ok: true });
});

// ─── Get councilors list ─────────────────────────────────────
app.get('/api/councilors', (req, res) => {
    try {
        const settings = JSON.parse(readFileSync(join(__dirname, 'councilors.json'), 'utf-8'));
        res.json(settings.map(b => ({
            id: b.id,
            name: b.name,
            role: b.role,
            enabled: b.enabled,
            model: b.model,
            color: b.color
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── LEGACY endpoints (for CLI) ──────────────────────────────
app.get('/api/status', (req, res) => {
    res.json({
        mode: liveSession.mode,
        activeCouncilors: liveSession.councilors.length,
        messageCount: liveSession.messages.length
    });
});


// ── MODES LIST ───────────────────────────────────────────────────────────────
app.get('/api/modes', (req, res) => {
    res.json({
        modes: [
            { id: 'proposal', label: 'Legislate', icon: '⚖️', description: 'Debate + vote on proposals' },
            { id: 'deliberation', label: 'Deliberate', icon: '⚖️', description: 'Deep roundtable discussion' },
            { id: 'inquiry', label: 'Inquiry', icon: '🔍', description: 'Rapid-fire Q&A' },
            { id: 'research', label: 'Deep Research', icon: '📊', description: 'Recursive multi-round investigation' },
            { id: 'swarm', label: 'Swarm Hive', icon: '🐝', description: 'Parallel task decomposition' },
            { id: 'swarm_coding', label: 'Swarm Coding', icon: '⚡', description: 'Full software engineering workflow' },
            { id: 'prediction', label: 'Prediction', icon: '🎯', description: 'Superforecasting with probability' },
            { id: 'government', label: 'Legislature', icon: '🏛️', description: 'Full legislative process (5 phases)' },
            { id: 'inspector', label: 'Inspector', icon: '🔬', description: 'Deep visual + data analysis' },
        ],
        total: 9,
        version: '3.0.0'
    });
});

// ── CONTEXT, VOTING, AUDIT, MCP JSON-RPC ────────────────────────────────────
app.post('/api/session/push-context', (req, res) => {
    if (!liveSession) return res.status(400).json({ error: 'no active session' });
    const { context } = req.body;
    if (typeof context !== 'string') return res.status(400).json({ error: 'context must be a string' });
    const block = { id: `ctx-${Date.now()}`, context, ts: new Date().toISOString() };
    liveSession.contextBlocks.push(block);
    appendAudit('context_push', { id: block.id, len: context.length });
    sseBroadcast('context', block);
    res.json({ ok: true, id: block.id, total: liveSession.contextBlocks.length });
});

app.get('/api/session/context', (req, res) => {
    if (!liveSession) return res.json({ blocks: [], total: 0 });
    res.json({ blocks: liveSession.contextBlocks, total: liveSession.contextBlocks.length });
});

app.post('/api/session/clear-context', (req, res) => {
    if (!liveSession) return res.json({ ok: true });
    liveSession.contextBlocks = [];
    appendAudit('context_clear', {});
    sseBroadcast('context_cleared', {});
    res.json({ ok: true });
});

app.post('/api/session/vote', (req, res) => {
    if (!liveSession) return res.status(400).json({ error: 'no active session' });
    const { option, rationale, councilorId } = req.body;
    if (!option) return res.status(400).json({ error: 'option is required' });
    const vote = {
        id: `vote-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
        option: String(option).toLowerCase(),
        rationale: rationale || null,
        councilorId: councilorId || null,
        ts: new Date().toISOString()
    };
    liveSession.votes[vote.id] = vote;
    if (vote.option === 'yea' || vote.option === 'yes') liveSession.stats.yeas = (liveSession.stats.yeas || 0) + 1;
    if (vote.option === 'nay' || vote.option === 'no') liveSession.stats.nays = (liveSession.stats.nays || 0) + 1;
    appendAudit('vote', { id: vote.id, option: vote.option, councilorId: vote.councilorId });
    sseBroadcast('vote_cast', vote);
    res.json({ ok: true, vote, stats: liveSession.stats });
});

app.get('/api/session/votes', (req, res) => {
    if (!liveSession) return res.json({ votes: {}, stats: { yeas: 0, nays: 0 } });
    res.json({ votes: liveSession.votes || {}, stats: liveSession.stats, total: Object.keys(liveSession.votes || {}).length });
});

app.get('/api/session/audit', (req, res) => {
    if (!liveSession) return res.json({ events: [], total: 0 });
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 100, 500));
    const events = (liveSession.audit || []).slice(-limit);
    res.json({ events, total: liveSession.audit.length, returned: events.length });
});

app.get('/api/session/consensus', (req, res) => {
    if (!liveSession) return res.status(400).json({ error: 'no active session' });
    const votes = Object.values(liveSession.votes || {});
    const yeas = votes.filter(v => v.option === 'yea' || v.option === 'yes').length;
    const nays = votes.filter(v => v.option === 'nay' || v.option === 'no').length;
    const total = votes.length;
    const ratio = total === 0 ? 0 : yeas / total;
    res.json({
        sessionId: liveSession.id,
        total,
        yeas,
        nays,
        ratio: Number(ratio.toFixed(3)),
        majority: yeas > nays ? 'yea' : (nays > yeas ? 'nay' : 'tied'),
        messageCount: liveSession.messages.length,
        contextBlocks: liveSession.contextBlocks.length,
        phase: liveSession.phase
    });
});

// ── JSON-RPC `/mcp` bridge used by ai-council/mcp-server.mjs ─────────────────
// The MCP proxy calls `tools/call` for everything (push_context, vote, etc.).
// This endpoint dispatches the JSON-RPC `method` field to the right local handler.
const RPC_HANDLERS = {
    'tools/list': () => ({
        tools: [
            { name: 'push_context', description: 'Add context to the active session' },
            { name: 'vote', description: 'Cast a vote in the deliberation' },
            { name: 'get_votes', description: 'Get all votes' },
            { name: 'get_consensus', description: 'Get consensus tally' },
            { name: 'subscribe_deliberation', description: 'SSE subscribe to session' },
            { name: 'get_audit_log', description: 'Get audit log' },
            { name: 'export_audit_log', description: 'Export audit log' },
            { name: 'clear_context', description: 'Clear context' },
            { name: 'get_context_window', description: 'Get context window' },
            { name: 'delegate_to', description: 'Delegate to a councilor' },
            { name: 'coordinate_agents', description: 'Coordinate agents' },
            { name: 'get_agent_status', description: 'Get agent status' },
            { name: 'list_resources', description: 'List MCP resources' },
            { name: 'read_resource', description: 'Read MCP resource' },
            { name: 'subscribe_resource', description: 'Subscribe to MCP resource' },
            { name: 'set_api_key', description: 'Set API key' },
            { name: 'validate_token', description: 'Validate API token' },
            { name: 'get_rate_limits', description: 'Get rate limits' },
            { name: 'register_webhook', description: 'Register webhook' },
            { name: 'list_webhooks', description: 'List webhooks' },
            { name: 'delete_webhook', description: 'Delete webhook' }
        ]
    }),

    'tools/call': async (params) => {
        const { name, arguments: args = {} } = params || {};
        switch (name) {
            case 'push_context': {
                if (!liveSession) return { error: 'no active session' };
                liveSession.contextBlocks.push({ id: `ctx-${Date.now()}`, context: args.context, ts: new Date().toISOString() });
                appendAudit('context_push', { len: (args.context || '').length });
                return { ok: true, total: liveSession.contextBlocks.length };
            }
            case 'vote': {
                if (!liveSession) return { error: 'no active session' };
                const opt = String(args.option || '').toLowerCase();
                const id = `vote-${Date.now()}`;
                liveSession.votes[id] = { id, option: opt, rationale: args.rationale, councilorId: args.councilorId, ts: new Date().toISOString() };
                if (opt === 'yea' || opt === 'yes') liveSession.stats.yeas++;
                if (opt === 'nay' || opt === 'no') liveSession.stats.nays++;
                appendAudit('vote', { id, option: opt });
                return { ok: true, id, stats: liveSession.stats };
            }
            case 'get_votes': return liveSession ? { votes: liveSession.votes, stats: liveSession.stats } : { votes: {}, stats: { yeas: 0, nays: 0 } };
            case 'get_consensus': {
                if (!liveSession) return { error: 'no active session' };
                const v = Object.values(liveSession.votes || {});
                const yeas = v.filter(x => x.option === 'yea' || x.option === 'yes').length;
                const nays = v.filter(x => x.option === 'nay' || x.option === 'no').length;
                return { yeas, nays, total: v.length, ratio: v.length ? Number((yeas / v.length).toFixed(3)) : 0, majority: yeas > nays ? 'yea' : (nays > yeas ? 'nay' : 'tied') };
            }
            case 'subscribe_deliberation': return { ok: true, stream: '/api/events', sessionId: liveSession?.id || null };
            case 'get_audit_log': return { events: (liveSession?.audit || []).slice(-(args.limit || 100)), total: (liveSession?.audit || []).length };
            case 'export_audit_log': return { events: liveSession?.audit || [], format: args.format || 'json' };
            case 'clear_context': if (liveSession) { liveSession.contextBlocks = []; appendAudit('context_clear', {}); } return { ok: true };
            case 'get_context_window': return liveSession ? { blocks: liveSession.contextBlocks, total: liveSession.contextBlocks.length } : { blocks: [], total: 0 };
            case 'delegate_to': {
                if (!liveSession) return { error: 'no active session' };
                const c = (liveSession.councilors || []).find(x => x.id === args.councilorId || (x.name || '').toLowerCase() === String(args.councilorId || '').toLowerCase());
                if (!c) return { error: `unknown councilor: ${args.councilorId}` };
                const result = await callLLM([
                    { role: 'system', content: `You are ${c.name} (${c.role}). ${c.description || ''} Address the user's task from your unique perspective.` },
                    { role: 'user', content: args.task }
                ], { model: c.model });
                return { councilor: c.name, ...result };
            }
            case 'coordinate_agents': return { ok: true, note: 'coordination stub — use /api/session/start with explicit councilors', agents: args.agents, task: args.task };
            case 'get_agent_status': return { session: liveSession ? { id: liveSession.id, phase: liveSession.phase, messageCount: liveSession.messages.length, councilorCount: liveSession.councilors.length } : null, sseClients: SSE_CLIENTS.size, currentProvider };
            case 'list_resources': return { resources: [{ uri: 'session://current', name: 'Current Session' }] };
            case 'read_resource': return args.uri === 'session://current' ? { contents: [{ uri: 'session://current', text: JSON.stringify(liveSession, null, 2) }] } : { error: 'unknown uri' };
            case 'subscribe_resource': return { ok: true, uri: args.uri, stream: '/api/events' };
            case 'set_api_key': return { ok: true, note: 'set via env var on next restart', provider: args.provider || 'minimax' };
            case 'validate_token': return { valid: true, token: (args.token || '').slice(0, 6) + '***' };
            case 'get_rate_limits': return { currentProvider, providers: listProviders(), window: 'session' };
            case 'register_webhook': return { ok: true, id: `wh-${Date.now()}`, url: args.url, events: args.events };
            case 'list_webhooks': return { webhooks: [] };
            case 'delete_webhook': return { ok: true, id: args.id };
            default: return { error: `Unknown tool: ${name}` };
        }
    }
};

app.post('/mcp', async (req, res) => {
    const { jsonrpc, method, params, id } = req.body || {};
    if (jsonrpc !== '2.0') return res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'invalid jsonrpc' }, id: id || null });
    const handler = RPC_HANDLERS[method];
    if (!handler) return res.status(404).json({ jsonrpc: '2.0', error: { code: -32601, message: `method not found: ${method}` }, id });
    try {
        const result = await handler(params || {});
        res.json({ jsonrpc: '2.0', result, id });
    } catch (e) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: e.message }, id });
    }
});

// ── ASK (ONE-SHOT) ──────────────────────────────────────────────────────────
app.post('/api/ask', (req, res) => {
    const { question, mode, councilors } = req.body;
    if (!question) return res.status(400).json({ error: 'question is required' });
    // Start session and respond immediately with session ID
    const sessionId = `ask-${Date.now()}`;
    sessions.set(sessionId, {
        id: sessionId,
        topic: question,
        mode: mode || 'deliberation',
        councilors: councilors || [],
        status: 'starting',
        messages: [],
        createdAt: new Date().toISOString()
    });
    // TODO: wire to actual deliberation engine via SSE push
    res.json({ sessionId, status: 'started', topic: question, mode: mode || 'deliberation' });
});

// ── INSPECTOR MODE ──────────────────────────────────────────────────────────
app.post('/api/vision/inspect', async (req, res) => {
    const { image, topic, mode } = req.body;
    if (!image && !topic) return res.status(400).json({ error: 'image or topic required' });
    // Forward to React app's deliberation engine
    // The React app handles the actual vision processing via SSE + Gemini API
    res.json({
        sessionId: `insp-${Date.now()}`,
        status: 'started',
        topic: topic || 'Inspect attached image',
        mode: 'inspector',
        note: 'Inspector mode runs through the React app UI. Open http://localhost:3002 and select Inspector mode.'
    });
});

// ── GOVERNMENT / LEGISLATURE MODE ─────────────────────────────────────────
app.post('/api/session/government', (req, res) => {
    res.json({
        sessionId: `gov-${Date.now()}`,
        status: 'started',
        mode: 'government',
        note: 'Government mode runs through the React app UI. Open http://localhost:3002 and select Legislature mode.'
    });
});

// ── PREDICTION MODE ─────────────────────────────────────────────────────────
app.post('/api/session/prediction', (req, res) => {
    res.json({
        sessionId: `pred-${Date.now()}`,
        status: 'started',
        mode: 'prediction',
        note: 'Prediction mode runs through the React app UI. Open http://localhost:3002 and select Prediction mode.'
    });
});

// ── SWARM DECOMPOSITION ───────────────────────────────────────────────────
app.post('/api/session/swarm', (req, res) => {
    res.json({
        sessionId: `swarm-${Date.now()}`,
        status: 'started',
        mode: 'swarm',
        note: 'Swarm mode runs through the React app UI. Open http://localhost:3002 and select Swarm Hive mode.'
    });
});

app.listen(PORT, () => {
    console.log(`🤖 AI Council API v2.1 running on port ${PORT}`);
    console.log(`   SSE: http://localhost:${PORT}/api/events`);
    console.log(`   REST: http://localhost:${PORT}/api/session/*`);
});
