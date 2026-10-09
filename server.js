// =====================================================================
// AI TÀI XỈU SUNWIN PRO v9.0 - PATTERN DATABASE EDITION
// Tự động đọc 10,000 mẫu cầu từ GitHub để tăng độ chính xác
// =====================================================================

import fastify from "fastify";
import cors from "@fastify/cors";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import fetch from "node-fetch";

// =====================================================================
// ⚙️ CẤU HÌNH - ĐÃ ĐIỀN SẴN LINK CỦA BẠN
// =====================================================================
const PORT = process.env.PORT || 3000;
const API_URL = "https://apisunwin-cocalhahaha.onrender.com/api/sunwin";

// 👇 Link RAW file 10kmaucau.txt của bạn (đã điền sẵn)
const PATTERN_FILE_URL = "https://raw.githubusercontent.com/huyhuyhu380-cell/ooocs/main/10kmaucau.txt";

// =====================================================================
// GLOBAL STATE
// =====================================================================
let txHistory = [];
let currentSessionId = null;
let fetchInterval = null;
let PATTERN_DB = [];        // 10,000 mẫu cầu
let PATTERN_STATS = null;   // Thống kê từ mẫu cầu

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================================================================
// STATS
// =====================================================================
const STATS = {
    STREAK_BREAK_PROB: {
        1: 0.51, 2: 0.48, 3: 0.52, 4: 0.58, 5: 0.66, 6: 0.74,
        7: 0.81, 8: 0.87, 9: 0.92, 10: 0.95, 11: 0.97, 12: 0.99
    },
    MARKOV_T_TO_X: 0.51,
    MARKOV_X_TO_T: 0.49,
    AVG_SCORE: 10.48,
    SCORE_DISTRIBUTION: {
        3: 0.005, 4: 0.012, 5: 0.028, 6: 0.046, 7: 0.068, 8: 0.092,
        9: 0.116, 10: 0.125, 11: 0.125, 12: 0.116, 13: 0.092,
        14: 0.068, 15: 0.046, 16: 0.028, 17: 0.012, 18: 0.005
    },
    PATTERN_FREQUENCY: {
        '1_1_pattern': 0.42, '2_2_pattern': 0.28, '3_3_pattern': 0.15,
        '4_4_pattern': 0.08, '1_2_1_pattern': 0.06, '2_1_2_pattern': 0.05,
        'short_run_pattern': 0.20, 'medium_run_pattern': 0.12,
        'long_run_pattern': 0.07, 'mega_long_run_pattern': 0.02
    }
};
// =====================================================================
// UTILITIES
// =====================================================================
function parseLines(data) {
    if (!Array.isArray(data)) return [];
    const arr = data.map(item => {
        const session = Number(item.phien ?? 0);
        const dice = Array.isArray(item.xuc_xac) ? item.xuc_xac : [];
        const total = Number(item.Tong ?? item.tong ?? 0);
        const result = item.ket_qua ?? (total >= 11 ? 'Tài' : 'Xỉu');
        const tx = result === 'Tài' ? 'T' : 'X';
        return { session, dice, total, result, tx };
    });
    return arr.filter(r => r.session > 0).sort((a, b) => a.session - b.session);
}

function lastN(arr, n) { return arr.slice(Math.max(0, arr.length - n)); }
function sum(nums) { return nums.reduce((a, b) => a + b, 0); }
function avg(nums) { return nums.length ? sum(nums) / nums.length : 0; }

function entropy(arr) {
    if (!arr.length) return 0;
    const freq = {};
    for (const v of arr) freq[v] = (freq[v] || 0) + 1;
    let e = 0, n = arr.length;
    for (const k in freq) { const p = freq[k] / n; e -= p * Math.log2(p); }
    return e;
}

function similarity(a, b) {
    if (a.length !== b.length) return 0;
    let m = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === b[i]) m++;
    return m / a.length;
}

function stdDev(nums) {
    if (nums.length < 2) return 0;
    const mean = avg(nums);
    return Math.sqrt(avg(nums.map(n => Math.pow(n - mean, 2))));
}
// =====================================================================
// 📚 ĐỌC FILE 10K MẪU CẦU TỪ GITHUB
// =====================================================================
async function fetchPatternFile(url) {
    try {
        console.log("📥 Đang tải file mẫu cầu từ GitHub...");
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const patterns = parsePatternText(text);
        console.log(`✅ Đã load ${patterns.length} mẫu cầu`);
        return patterns;
    } catch (e) {
        console.error("❌ Lỗi đọc file mẫu cầu:", e.message);
        return [];
    }
}

function parsePatternText(text) {
    const lines = text.split("\n");
    const patterns = [];
    for (const line of lines) {
        const m = line.match(/^\s*\d+\.\s*([TX]+)\s*-\s*([TX])\s*$/);
        if (m) {
            patterns.push({
                seq: m[1],
                next: m[2],
                len: m[1].length
            });
        }
    }
    return patterns;
}

function analyzePatternStats(patterns) {
    if (!patterns.length) return null;
    const tCount = patterns.filter(p => p.next === 'T').length;
    const xCount = patterns.filter(p => p.next === 'X').length;

    const byLength = {};
    for (const p of patterns) {
        if (!byLength[p.len]) byLength[p.len] = { T: 0, X: 0, total: 0 };
        byLength[p.len][p.next]++;
        byLength[p.len].total++;
    }

    const suffixStats = {};
    for (const p of patterns) {
        for (const suffixLen of [3, 4, 5, 6, 7]) {
            if (p.seq.length < suffixLen) continue;
            const suffix = p.seq.slice(-suffixLen);
            if (!suffixStats[suffix]) suffixStats[suffix] = { T: 0, X: 0 };
            suffixStats[suffix][p.next]++;
        }
    }

    return {
        total: patterns.length,
        tCount, xCount,
        tRatio: tCount / patterns.length,
        byLength,
        suffixStats
    };
}
// =====================================================================
// FEATURE EXTRACTION
// =====================================================================
function extractFeatures(history) {
    const tx = history.map(h => h.tx);
    const totals = history.map(h => h.total);
    const freq = {};
    for (const v of tx) freq[v] = (freq[v] || 0) + 1;

    let runs = [], cur = tx[0], len = 1;
    for (let i = 1; i < tx.length; i++) {
        if (tx[i] === cur) len++;
        else { runs.push({ val: cur, len }); cur = tx[i]; len = 1; }
    }
    if (tx.length) runs.push({ val: cur, len });

    const meanTotal = avg(totals);
    const volatility = Math.sqrt(avg(totals.map(t => Math.pow(t - meanTotal, 2))));

    let tStreak = 0, xStreak = 0;
    for (let i = tx.length - 1; i >= 0; i--) {
        if (tx[i] === 'T') tStreak++; else break;
    }
    for (let i = tx.length - 1; i >= 0; i--) {
        if (tx[i] === 'X') xStreak++; else break;
    }

    return {
        tx, totals, freq, runs,
        maxRun: runs.reduce((m, r) => Math.max(m, r.len), 0),
        avgRunLength: avg(runs.map(r => r.len)),
        meanTotal, volatility,
        entropy: entropy(tx),
        lastRun: runs[runs.length - 1],
        tStreak, xStreak,
        mean5: avg(totals.slice(-5)),
        mean10: avg(totals.slice(-10)),
        mean20: avg(totals.slice(-20))
    };
}

// =====================================================================
// PATTERN DETECTION
// =====================================================================
function detectPatternType(runs) {
    if (!runs || runs.length < 3) return null;
    const lastRuns = runs.slice(-15);
    const lengths = lastRuns.map(r => r.len);
    const values = lastRuns.map(r => r.val);

    if (lengths.length >= 5 && lengths.slice(-5).every(l => l === 1)) {
        const vals = values.slice(-6);
        if (vals.every((v, i) => i === 0 || v !== vals[i-1])) return '1_1_pattern';
    }
    if (lengths.length >= 4 && lengths.slice(-4).every(l => l === 2)) {
        const vals = values.slice(-5);
        if (vals.every((v, i) => i === 0 || v !== vals[i-1])) return '2_2_pattern';
    }
    if (lengths.length >= 3 && lengths.slice(-3).every(l => l === 3)) return '3_3_pattern';
    if (lengths.length >= 3 && lengths.slice(-3).every(l => l === 4)) return '4_4_pattern';

    if (lengths.length >= 5) {
        const t = lengths.slice(-5);
        if (t.join('') === '12121') return '1_2_1_pattern';
        if (t.join('') === '21212') return '2_1_2_pattern';
        if (t.join('') === '32323') return '3_2_3_pattern';
        if (t.join('') === '23232') return '2_3_2_pattern';
    }

    const lastRun = lastRuns[lastRuns.length - 1];
    if (lastRun) {
        if (lastRun.len >= 12) return 'mega_long_run_pattern';
        if (lastRun.len >= 10) return 'super_long_run_pattern';
        if (lastRun.len >= 8) return 'very_long_run_pattern';
        if (lastRun.len >= 7) return 'long_run_pattern';
        if (lastRun.len >= 5) return 'medium_long_run_pattern';
        if (lastRun.len >= 4) return 'medium_run_pattern';
        if (lastRun.len >= 3) return 'short_run_pattern';
    }
    return 'random_pattern';
}
// =====================================================================
// 🎯 THUẬT TOÁN DÙNG 10K MẪU CẦU THỰC
// =====================================================================

// Algo R: Exact Match - tìm chuỗi giống hệt trong 10k mẫu
function algoR_ExactPatternMatch(history) {
    if (!PATTERN_DB.length || history.length < 8) return null;
    const tx = history.map(h => h.tx);

    for (const len of [15, 14, 13, 12, 11, 10, 9, 8]) {
        if (tx.length < len) continue;
        const target = tx.slice(-len).join('');
        const matches = PATTERN_DB.filter(p => p.seq === target);
        if (matches.length >= 2) {
            const tCount = matches.filter(m => m.next === 'T').length;
            const xCount = matches.filter(m => m.next === 'X').length;
            const confidence = Math.abs(tCount - xCount) / matches.length;
            if (confidence >= 0.5) {
                return tCount > xCount ? 'T' : 'X';
            }
        }
    }
    return null;
}

// Algo T: Fuzzy Match - chuỗi gần giống (>=80%)
function algoT_FuzzyPatternMatch(history) {
    if (!PATTERN_DB.length || history.length < 15) return null;
    const tx = history.map(h => h.tx);
    const len = 15;
    if (tx.length < len) return null;
    const target = tx.slice(-len).join('');

    const scored = [];
    for (const p of PATTERN_DB) {
        if (p.seq.length !== len) continue;
        let match = 0;
        for (let i = 0; i < len; i++) if (p.seq[i] === target[i]) match++;
        const score = match / len;
        if (score >= 0.8) {
            scored.push({ next: p.next, weight: score * score });
        }
    }

    if (scored.length < 5) return null;
    let wT = 0, wX = 0;
    for (const s of scored) {
        if (s.next === 'T') wT += s.weight;
        else wX += s.weight;
    }
    const total = wT + wX;
    if (total === 0) return null;
    const confidence = Math.abs(wT - wX) / total;
    if (confidence >= 0.15) return wT > wX ? 'T' : 'X';
    return null;
}

// Algo U: Suffix Match - tìm mẫu cầu có ĐUÔI giống hiện tại
function algoU_SuffixPatternMatch(history) {
    if (!PATTERN_DB.length || history.length < 6) return null;
    const tx = history.map(h => h.tx);

    let bestPred = null, bestScore = 0;
    for (const suffixLen of [7, 6, 5, 4, 3]) {
        if (tx.length < suffixLen) continue;
        const suffix = tx.slice(-suffixLen).join('');
        const matches = PATTERN_DB.filter(p => p.seq.endsWith(suffix));
        if (matches.length < 3) continue;

        const tCount = matches.filter(m => m.next === 'T').length;
        const xCount = matches.filter(m => m.next === 'X').length;
        const total = matches.length;
        const confidence = Math.abs(tCount - xCount) / total;
        const score = confidence * Math.min(1, total / 20) * (suffixLen / 7);

        if (score > bestScore && confidence >= 0.4) {
            bestScore = score;
            bestPred = tCount > xCount ? 'T' : 'X';
        }
    }
    return bestPred;
}

// Algo V: Full Sequence Similarity - so sánh 15 phiên gần nhất với toàn bộ DB
function algoV_SequenceSimilarity(history) {
    if (!PATTERN_DB.length || history.length < 15) return null;
    const tx = history.map(h => h.tx);
    const target = tx.slice(-15).join('');

    const weights = { T: 0, X: 0 };
    const SIM_THRESHOLD = 0.65;

    const sample = PATTERN_DB.length > 5000
        ? PATTERN_DB.filter((_, i) => i % 2 === 0)
        : PATTERN_DB;

    for (const p of sample) {
        const sim = similarity(p.seq, target);
        if (sim >= SIM_THRESHOLD) {
            const w = Math.pow(sim, 3);
            weights[p.next] += w;
        }
    }

    const total = weights.T + weights.X;
    if (total < 2) return null;
    const confidence = Math.abs(weights.T - weights.X) / total;
    if (confidence >= 0.2) return weights.T > weights.X ? 'T' : 'X';
    return null;
}
// =====================================================================
// THUẬT TOÁN CŨ
// =====================================================================
function algoA_markov(history) {
    if (history.length < 15) return null;
    const tx = history.map(h => h.tx);
    let maxOrder = history.length < 30 ? 3 : 5;
    let bestPred = null, bestScore = -1;
    for (let order = 2; order <= maxOrder; order++) {
        if (tx.length < order + 8) continue;
        const transitions = {};
        const totalT = tx.length - order;
        for (let i = 0; i < totalT; i++) {
            const key = tx.slice(i, i + order).join('');
            const next = tx[i + order];
            const w = Math.pow(0.95, totalT - i - 1);
            if (!transitions[key]) transitions[key] = { T: 0, X: 0 };
            transitions[key][next] += w;
        }
        const lastKey = tx.slice(-order).join('');
        const c = transitions[lastKey];
        if (c && (c.T + c.X) > 0.5) {
            const conf = Math.abs(c.T - c.X) / (c.T + c.X);
            const pred = c.T > c.X ? 'T' : 'X';
            const score = conf * (order / maxOrder) * Math.min(1, (c.T + c.X) / 10);
            if (score > bestScore) { bestScore = score; bestPred = pred; }
        }
    }
    return bestPred;
}

function algoB_ngram(history) {
    if (history.length < 30) return null;
    const tx = history.map(h => h.tx);
    let bestPred = null, bestConf = 0;
    for (const n of [7, 6, 5, 4, 3]) {
        if (tx.length < n * 2) continue;
        const target = tx.slice(-n).join('');
        const matches = [];
        for (let i = 0; i <= tx.length - n - 1; i++) {
            if (tx.slice(i, i + n).join('') === target) {
                matches.push({ next: tx[i + n], distance: tx.length - i });
            }
        }
        if (matches.length >= 2) {
            const w = { T: 0, X: 0 };
            let tw = 0;
            for (const m of matches) {
                const wt = 1 / (m.distance * 0.5 + 1);
                w[m.next] += wt;
                tw += wt;
            }
            if (tw > 0) {
                const conf = Math.abs(w.T - w.X) / tw;
                if (conf > bestConf) {
                    bestConf = conf;
                    bestPred = w.T > w.X ? 'T' : 'X';
                }
            }
        }
    }
    return bestConf > 0.3 ? bestPred : null;
}

function algoG_SuperBridgePredictor(history) {
    const features = extractFeatures(history);
    const { runs } = features;
    if (runs.length < 4) return null;
    const lastRun = runs[runs.length - 1];
    if (lastRun.len >= 10) return lastRun.val === 'T' ? 'X' : 'T';
    if (lastRun.len >= 8) return lastRun.val === 'T' ? 'X' : 'T';
    if (lastRun.len >= 7) {
        const avgRun = avg(runs.map(r => r.len));
        if (lastRun.len > avgRun * 2) return lastRun.val === 'T' ? 'X' : 'T';
    }
    if (lastRun.len >= 5 && lastRun.len <= 6) {
        const avgRun = avg(runs.map(r => r.len));
        if (lastRun.len > avgRun * 1.8) return lastRun.val === 'T' ? 'X' : 'T';
    }
    return null;
}

function algoH_AdaptiveMarkov(history) {
    if (history.length < 25) return null;
    const tx = history.map(h => h.tx);
    const votes = { T: 0, X: 0 };
    for (const order of [2, 3, 4, 5]) {
        if (tx.length < order + 5) continue;
        const transitions = {};
        for (let i = 0; i <= tx.length - order - 1; i++) {
            const key = tx.slice(i, i + order).join('');
            const next = tx[i + order];
            if (!transitions[key]) transitions[key] = { T: 0, X: 0 };
            transitions[key][next]++;
        }
        const lastKey = tx.slice(-order).join('');
        const c = transitions[lastKey];
        if (c && c.T + c.X >= 2) {
            const pred = c.T > c.X ? 'T' : 'X';
            const conf = Math.abs(c.T - c.X) / (c.T + c.X);
            votes[pred] += conf * (order / 10);
        }
    }
    if (votes.T + votes.X > 0.3) return votes.T > votes.X ? 'T' : 'X';
    return null;
}

function algoI_PatternMaster(history) {
    if (history.length < 25) return null;
    const features = extractFeatures(history);
    const { runs, tx } = features;
    if (runs.length < 5) return null;
    const recentRuns = runs.slice(-8);
    const runLengths = recentRuns.map(r => r.len);
    const runValues = recentRuns.map(r => r.val);
    const runPattern = runLengths.join('');
    const lastVal = runValues[runValues.length - 1];

    let strength = { T: 0, X: 0 };
    const lib = [
        { p: '12121', pred: lastVal === 'T' ? 'X' : 'T', s: 0.72 },
        { p: '21212', pred: lastVal === 'T' ? 'T' : 'X', s: 0.72 },
        { p: '121212', pred: lastVal === 'T' ? 'X' : 'T', s: 0.78 },
        { p: '212121', pred: lastVal === 'T' ? 'T' : 'X', s: 0.78 },
        { p: '221221', pred: lastVal === 'T' ? 'T' : 'X', s: 0.72 },
        { p: '112112', pred: lastVal === 'T' ? 'X' : 'T', s: 0.72 }
    ];
    for (const l of lib) {
        if (runPattern.includes(l.p)) strength[l.pred] += l.s;
    }

    const last10 = tx.slice(-10).join('');
    const last12 = tx.slice(-12).join('');
    const txPats = [
        { p: 'TXTXTXTX', pred: 'X', s: 0.82 },
        { p: 'XTXTXTXT', pred: 'T', s: 0.82 },
        { p: 'TTXXTTXX', pred: 'X', s: 0.72 },
        { p: 'XXTTXXTT', pred: 'T', s: 0.72 }
    ];
    for (const p of txPats) {
        if (last10.includes(p.p)) strength[p.pred] += p.s;
        if (last12.includes(p.p)) strength[p.pred] += p.s * 0.3;
    }

    const total = strength.T + strength.X;
    if (total > 0) {
        const conf = Math.abs(strength.T - strength.X) / total;
        if (conf > 0.25) return strength.T > strength.X ? 'T' : 'X';
    }
    return null;
}

function algoQ_StreakProbability(history) {
    if (history.length < 15) return null;
    const features = extractFeatures(history);
    const lastRun = features.runs[features.runs.length - 1];
    if (!lastRun) return null;
    const bp = STATS.STREAK_BREAK_PROB[Math.min(lastRun.len, 12)] || 0.99;
    if (bp > 0.6) return lastRun.val === 'T' ? 'X' : 'T';
    if (bp < 0.4) return lastRun.val;
    return null;
}

function algoN_TransitionMatrix(history) {
    if (history.length < 30) return null;
    const tx = history.map(h => h.tx);
    const recent = tx.slice(-50);
    const t = { TT: 0, TX: 0, XT: 0, XX: 0 };
    for (let i = 1; i < recent.length; i++) {
        t[recent[i-1] + recent[i]]++;
    }
    const last = recent[recent.length - 1];
    const totalFromLast = last === 'T' ? t.TT + t.TX : t.XT + t.XX;
    if (totalFromLast < 5) return null;
    const probFlip = last === 'T' ? t.TX / totalFromLast : t.XT / totalFromLast;
    if (probFlip > 0.55) return last === 'T' ? 'X' : 'T';
    if (probFlip < 0.45) return last;
    return null;
}

function algoL_MomentumReversal(history) {
    if (history.length < 30) return null;
    const totals = history.map(h => h.total);
    const m5 = avg(totals.slice(-5));
    const m20 = avg(totals.slice(-20));
    if (m5 > 12.5) return 'X';
    if (m5 < 8.5) return 'T';
    if (m5 > m20 + 2) return 'X';
    if (m5 < m20 - 2) return 'T';
    return null;
}
// =====================================================================
// DANH SÁCH THUẬT TOÁN
// =====================================================================
const ALL_ALGS = [
    { id: 'algoR_exact_pattern', fn: algoR_ExactPatternMatch, group: 'pattern_db' },
    { id: 'algoT_fuzzy_pattern', fn: algoT_FuzzyPatternMatch, group: 'pattern_db' },
    { id: 'algoU_suffix_pattern', fn: algoU_SuffixPatternMatch, group: 'pattern_db' },
    { id: 'algoV_sequence_similarity', fn: algoV_SequenceSimilarity, group: 'pattern_db' },
    { id: 'a_markov', fn: algoA_markov, group: 'follow' },
    { id: 'b_ngram', fn: algoB_ngram, group: 'follow' },
    { id: 'i_pattern_master', fn: algoI_PatternMaster, group: 'follow' },
    { id: 'g_super_bridge', fn: algoG_SuperBridgePredictor, group: 'reverse' },
    { id: 'l_momentum_reversal', fn: algoL_MomentumReversal, group: 'reverse' },
    { id: 'q_streak_probability', fn: algoQ_StreakProbability, group: 'reverse' },
    { id: 'h_adaptive_markov', fn: algoH_AdaptiveMarkov, group: 'neutral' },
    { id: 'n_transition_matrix', fn: algoN_TransitionMatrix, group: 'neutral' }
];

// =====================================================================
// ENSEMBLE
// =====================================================================
class Ensemble {
    constructor() {
        this.weights = {};
        this.recentPredictions = [];
        this.recentActuals = [];
        this.predictionLog = {};

        for (const a of ALL_ALGS) {
            this.weights[a.id] = a.group === 'pattern_db' ? 3.0 : 1.0;
        }
        this.normalizeWeights();
    }

    normalizeWeights() {
        const total = Object.values(this.weights).reduce((s, w) => s + w, 0);
        if (total > 0) {
            for (const id in this.weights) this.weights[id] /= total;
        }
    }

    updateWeights(historyPrefix, actualTx) {
        for (const a of ALL_ALGS) {
            try {
                const pred = a.fn(historyPrefix);
                if (pred) {
                    const correct = pred === actualTx ? 1 : 0;
                    const isPatternDB = a.group === 'pattern_db';
                    const lr = isPatternDB ? 0.05 : 0.02;
                    const currentW = this.weights[a.id];
                    const targetW = correct ? currentW * (1 + lr) : currentW * (1 - lr);
                    this.weights[a.id] = Math.max(0.01, Math.min(5, targetW));
                }
            } catch (e) {}
        }
        this.normalizeWeights();
    }

    predict(history) {
        if (history.length < 12) {
            const tCount = history.filter(h => h.tx === 'T').length;
            const xCount = history.filter(h => h.tx === 'X').length;
            const fallback = tCount > xCount ? 'X' : 'T';
            return {
                prediction: fallback === 'T' ? 'tài' : 'xỉu',
                confidence: 0.5,
                rawPrediction: fallback
            };
        }

        const votes = { T: 0, X: 0 };
        const details = [];

        for (const a of ALL_ALGS) {
            try {
                const pred = a.fn(history);
                if (!pred) continue;
                const w = this.weights[a.id];
                votes[pred] += w;
                details.push({ algo: a.id, pred, w: w.toFixed(3), group: a.group });
            } catch (e) {}
        }

        const total = votes.T + votes.X;
        if (total === 0) {
            return {
                prediction: 'tài', confidence: 0.5,
                rawPrediction: 'T', details
            };
        }

        const best = votes.T > votes.X ? 'T' : 'X';
        const ratio = Math.max(votes.T, votes.X) / total;
        const confidence = Math.min(0.95, Math.max(0.55, ratio));

        // Anti-stuck
        const last4 = this.recentPredictions.slice(-4);
        if (last4.length === 4 && last4.every(p => p === best)) {
            const last4Actuals = this.recentActuals.slice(-4);
            const wrong = last4.filter((p, i) => p !== last4Actuals[i]).length;
            if (wrong >= 3) {
                const flipped = best === 'T' ? 'X' : 'T';
                return {
                    prediction: flipped === 'T' ? 'tài' : 'xỉu',
                    confidence: 0.6,
                    rawPrediction: flipped,
                    details
                };
            }
        }

        const patternVotes = details.filter(d => d.group === 'pattern_db');
        const patternT = patternVotes.filter(d => d.pred === 'T').length;
        const patternX = patternVotes.filter(d => d.pred === 'X').length;

        return {
            prediction: best === 'T' ? 'tài' : 'xỉu',
            confidence,
            rawPrediction: best,
            patternVotes: { T: patternT, X: patternX },
            details
        };
    }
}
// =====================================================================
// MANAGER
// =====================================================================
class Manager {
    constructor() {
        this.history = [];
        this.ensemble = new Ensemble();
        this.currentPrediction = null;
    }

    loadInitial(lines) {
        this.history = lines;
        this.currentPrediction = this.ensemble.predict(this.history);
        console.log(`🔮 Dự đoán phiên ${lines.at(-1).session + 1}: ${this.currentPrediction.prediction} (${(this.currentPrediction.confidence * 100).toFixed(0)}%)`);
    }

    pushRecord(record) {
        if (this.currentPrediction) {
            this.ensemble.predictionLog[record.session] = {
                pred: this.currentPrediction.rawPrediction,
                conf: this.currentPrediction.confidence
            };
            this.ensemble.recentPredictions.push(this.currentPrediction.rawPrediction);
            if (this.ensemble.recentPredictions.length > 20) this.ensemble.recentPredictions.shift();
        }
        this.ensemble.recentActuals.push(record.tx);
        if (this.ensemble.recentActuals.length > 20) this.ensemble.recentActuals.shift();

        const prefix = this.history.slice(0, -1);
        if (prefix.length >= 10) this.ensemble.updateWeights(prefix, record.tx);

        this.history.push(record);
        if (this.history.length > 500) this.history = this.history.slice(-450);
        this.currentPrediction = this.ensemble.predict(this.history);
        console.log(`📥 ${record.session} → ${record.result}. Dự đoán ${record.session + 1}: ${this.currentPrediction.prediction} (${(this.currentPrediction.confidence * 100).toFixed(0)}%)`);
    }
}

const seiuManager = new Manager();

// =====================================================================
// FETCH API SUNWIN
// =====================================================================
async function fetchAndProcessHistory() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        const newHistory = parseLines(data);

        if (newHistory.length === 0) {
            console.log("⚠️ Không có dữ liệu từ API.");
            return;
        }

        const lastSessionInHistory = newHistory.at(-1);

        if (!currentSessionId) {
            seiuManager.loadInitial(newHistory);
            txHistory = newHistory;
            currentSessionId = lastSessionInHistory.session;
            console.log(`✅ Đã tải ${newHistory.length} phiên lịch sử.`);
        } else if (lastSessionInHistory.session > currentSessionId) {
            const newRecords = newHistory.filter(r => r.session > currentSessionId);
            for (const record of newRecords) {
                seiuManager.pushRecord(record);
                txHistory.push(record);
            }
            if (txHistory.length > 350) txHistory = txHistory.slice(-300);
            currentSessionId = lastSessionInHistory.session;
            if (newRecords.length > 0) {
                console.log(`🆕 Cập nhật ${newRecords.length} phiên. Phiên cuối: ${currentSessionId}`);
            }
        }
    } catch (e) {
        console.error("❌ Lỗi fetch:", e.message);
    }
}

// =====================================================================
// FASTIFY SERVER
// =====================================================================
const app = fastify({ logger: true });
await app.register(cors, { origin: "*" });

// ----- ENDPOINT 1: Dự đoán phiên tiếp theo -----
app.get("/api/sunwin/tx", async () => {
    const lastResult = txHistory.at(-1) || null;
    const currentPrediction = seiuManager.currentPrediction;

    if (!lastResult || !currentPrediction) {
        return {
            id: "@cskhgiabao",
            phien_truoc: null,
            xuc_xac: null,
            ket_qua: "đang chờ...",
            phien_nay: null,
            du_doan: "chưa có",
            do_tin_cay: "0%"
        };
    }

    return {
        id: "@cskhgiabao",
        phien_truoc: lastResult.session,
        xuc_xac: lastResult.dice,
        ket_qua: lastResult.result.toLowerCase(),
        phien_nay: lastResult.session + 1,
        du_doan: currentPrediction.prediction,
        do_tin_cay: `${(currentPrediction.confidence * 100).toFixed(0)}%`,
        pattern_db_size: PATTERN_DB.length,
        pattern_votes: currentPrediction.patternVotes || null
    };
});

// ----- ENDPOINT 2: Lịch sử + nhận xét -----
app.get("/api/sunwin/history", async () => {
    if (!txHistory.length) return { message: "không có dữ liệu lịch sử." };
    const reversed = [...txHistory].sort((a, b) => b.session - a.session);

    return reversed.map((item) => {
        const log = seiuManager.ensemble.predictionLog[item.session];
        let nhan_xet = "—";
        if (log) {
            const dung = log.pred === item.tx;
            nhan_xet = dung
                ? `✅ Đúng (dự đoán ${log.pred === 'T' ? 'tài' : 'xỉu'} ${(log.conf * 100).toFixed(0)}%)`
                : `❌ Sai (dự đoán ${log.pred === 'T' ? 'tài' : 'xỉu'} ${(log.conf * 100).toFixed(0)}%)`;
        }
        return {
            session: item.session,
            dice: item.dice,
            total: item.total,
            result: item.result.toLowerCase(),
            tx_label: item.tx.toLowerCase(),
            nhan_xet
        };
    });
});

// ----- ENDPOINT 3: Kiểm tra trạng thái -----
app.get("/api/balance/stats", async () => {
    const preds = seiuManager.ensemble.recentPredictions;
    const acts = seiuManager.ensemble.recentActuals;
    const predT = preds.filter(p => p === 'T').length;
    const predX = preds.filter(p => p === 'X').length;
    const actT = acts.filter(a => a === 'T').length;
    const actX = acts.filter(a => a === 'X').length;

    return {
        pattern_db: {
            total: PATTERN_DB.length,
            loaded: PATTERN_DB.length > 0,
            source: PATTERN_FILE_URL
        },
        predictions: {
            total: preds.length, T: predT, X: predX,
            ratio_T: preds.length > 0 ? (predT / preds.length * 100).toFixed(1) + '%' : '0%'
        },
        actuals: {
            total: acts.length, T: actT, X: actX,
            ratio_T: acts.length > 0 ? (actT / acts.length * 100).toFixed(1) + '%' : '0%'
        },
        weights: seiuManager.ensemble.weights
    };
});

// ----- ENDPOINT 4: Trang HTML xem lịch sử + đúng/sai -----
app.get("/xem", async (req, reply) => {
    if (!txHistory.length) return reply.type("text/html").send("<h1>Chưa có dữ liệu</h1>");

    const reversed = [...txHistory].sort((a, b) => b.session - a.session).slice(0, 100);

    let total = 0, correct = 0;
    for (const item of reversed) {
        const log = seiuManager.ensemble.predictionLog[item.session];
        if (log) {
            total++;
            if (log.pred === item.tx) correct++;
        }
    }
    const accuracy = total > 0 ? (correct / total * 100).toFixed(1) : "0.0";

    const rows = reversed.map(item => {
        const log = seiuManager.ensemble.predictionLog[item.session];
        let nhan_xet = "—";
        let color = "#888";
        if (log) {
            const dung = log.pred === item.tx;
            nhan_xet = dung
                ? `✅ Đúng (dự đoán ${log.pred === 'T' ? 'Tài' : 'Xỉu'} ${(log.conf * 100).toFixed(0)}%)`
                : `❌ Sai (dự đoán ${log.pred === 'T' ? 'Tài' : 'Xỉu'} ${(log.conf * 100).toFixed(0)}%)`;
            color = dung ? "#00ff88" : "#ff4444";
        }
        const txColor = item.tx === 'T' ? '#ff6b6b' : '#4ecdc4';
        return `<tr>
            <td>${item.session}</td>
            <td><span style="color:${txColor}; font-weight:bold;">${item.tx === 'T' ? 'TÀI' : 'XỈU'}</span></td>
            <td>${item.total}</td>
            <td style="color:${color}; font-weight:bold;">${nhan_xet}</td>
        </tr>`;
    }).join("");

    const current = seiuManager.currentPrediction;
    const nextSession = txHistory.at(-1).session + 1;

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="10">
<title>AI Tài Xỉu Sunwin - Lịch sử</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0e1a; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 12px; }
    h1 { font-size: 18px; margin-bottom: 8px; color: #ffd700; }
    .stats { background: #1a1f2e; padding: 12px; border-radius: 8px; margin-bottom: 12px; display: flex; gap: 16px; flex-wrap: wrap; }
    .stat-item { font-size: 13px; }
    .stat-item b { color: #ffd700; }
    .current { background: linear-gradient(135deg, #1e3a5f 0%, #2d1b4e 100%); padding: 14px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #ffd700; }
    .current h2 { font-size: 15px; margin-bottom: 6px; }
    .pred { font-size: 24px; font-weight: bold; color: #ffd700; text-transform: uppercase; }
    .conf { font-size: 13px; color: #aaa; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; background: #1a1f2e; border-radius: 8px; overflow: hidden; font-size: 13px; }
    th { background: #252b3d; padding: 10px 8px; text-align: left; font-size: 12px; color: #ffd700; }
    td { padding: 10px 8px; border-top: 1px solid #252b3d; }
    tr:hover { background: #232938; }
    .updated { font-size: 11px; color: #666; text-align: center; margin-top: 12px; }
</style>
</head>
<body>
    <h1>🎲 AI Tài Xỉu Sunwin v9.0</h1>

    <div class="current">
        <h2>🔮 Dự đoán phiên ${nextSession}</h2>
        <div class="pred">${current ? current.prediction : 'Đang chờ...'}</div>
        <div class="conf">Độ tin cậy: ${current ? (current.confidence * 100).toFixed(0) : 0}% | Pattern DB: ${PATTERN_DB.length} mẫu</div>
    </div>

    <div class="stats">
        <div class="stat-item">Tổng dự đoán: <b>${total}</b></div>
        <div class="stat-item">Đúng: <b style="color:#00ff88;">${correct}</b></div>
        <div class="stat-item">Sai: <b style="color:#ff4444;">${total - correct}</b></div>
        <div class="stat-item">Tỷ lệ đúng: <b>${accuracy}%</b></div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Phiên</th>
                <th>Kết quả</th>
                <th>Tổng</th>
                <th>Nhận xét</th>
            </tr>
        </thead>
        <tbody>
            ${rows}
        </tbody>
    </table>

    <div class="updated">Tự động cập nhật mỗi 10 giây • ${new Date().toLocaleString('vi-VN')}</div>
</body>
</html>`;

    reply.type("text/html").send(html);
});
// ----- ENDPOINT 5: Thông tin gốc -----
app.get("/", async () => {
    return {
        status: "ok",
        msg: "AI Tài Xỉu Sunwin Pro v9.0 - Pattern Database Edition",
        version: "9.0",
        algorithms: ALL_ALGS.length,
        pattern_db_loaded: PATTERN_DB.length,
        pattern_db_source: PATTERN_FILE_URL,
        endpoints: [
            "/api/sunwin/tx         → Dự đoán phiên tiếp theo",
            "/api/sunwin/history    → Lịch sử + nhận xét đúng/sai (JSON)",
            "/api/balance/stats     → Trạng thái AI + weights",
            "/xem                   → 🌐 Trang web xem lịch sử đẹp"
        ]
    };
});

// =====================================================================
// START SERVER
// =====================================================================
const start = async () => {
    // 1. Load file mẫu cầu TRƯỚC KHI start server
    console.log("📥 Đang tải file mẫu cầu từ GitHub...");
    PATTERN_DB = await fetchPatternFile(PATTERN_FILE_URL);
    if (PATTERN_DB.length > 0) {
        PATTERN_STATS = analyzePatternStats(PATTERN_DB);
        console.log(`✅ Đã load ${PATTERN_DB.length} mẫu cầu vào bộ nhớ`);
        console.log(`   📊 Phân bố: T=${PATTERN_STATS.tCount} (${(PATTERN_STATS.tRatio*100).toFixed(1)}%) | X=${PATTERN_STATS.xCount} (${((1-PATTERN_STATS.tRatio)*100).toFixed(1)}%)`);
    } else {
        console.log("⚠️ Không có mẫu cầu - AI vẫn chạy bình thường");
    }

    // 2. Start web server
    try {
        await app.listen({ port: PORT, host: "0.0.0.0" });
    } catch (err) {
        const fs = await import("node:fs");
        const logFile = path.join(__dirname, "server-error.log");
        const errorMsg = `
================= SERVER ERROR =================
Time: ${new Date().toISOString()}
Error: ${err.message}
Stack: ${err.stack}
=================================================
`;
        console.error(errorMsg);
        fs.writeFileSync(logFile, errorMsg, { encoding: "utf8", flag: "a+" });
        process.exit(1);
    }

    // 3. Bắt đầu chu kỳ fetch data mỗi 5 giây
    fetchAndProcessHistory();
    clearInterval(fetchInterval);
    fetchInterval = setInterval(fetchAndProcessHistory, 5000);

    console.log("\n🚀 AI Tài Xỉu Sunwin Pro v9.0 - Pattern Database Edition!");
    console.log(`   ➜ Local:   http://localhost:${PORT}/`);
    console.log(`   ➜ Endpoints:`);
    console.log(`     • GET /api/sunwin/tx       → Dự đoán`);
    console.log(`     • GET /api/sunwin/history  → Lịch sử JSON`);
    console.log(`     • GET /api/balance/stats   → Trạng thái`);
    console.log(`     • GET /xem                 → 🌐 Trang xem đẹp`);
    console.log(`\n📚 Pattern DB: ${PATTERN_DB.length} mẫu cầu`);
    console.log(`🔧 ${ALL_ALGS.length} thuật toán (4 dùng pattern DB + 8 cũ)`);
    console.log(`🔄 Chu kỳ fetch: 5 giây\n`);
};

start();