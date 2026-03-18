import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Search, Loader2, FileText, AlertCircle, Sparkles, ChevronRight, BookOpen, Zap, BrainCircuit } from 'lucide-react';

const SYSTEM_PROMPT_TEMPLATE = `You are a senior research orchestrator running a multi-source deep research workflow on [TOPIC].

Your job is to simulate or coordinate parallel research agents and then synthesize their findings into one high-quality, decision-useful report.

Objective
Produce a deep research document that captures:
- what people are saying about [TOPIC]
- where consensus exists
- where opinions conflict
- emerging patterns
- underserved angles
- practical opportunities

Research Window
Prioritize recent information, especially from the last 2 weeks where possible.
If a source has limited recent coverage, expand carefully to the last 30–90 days and clearly label that in the output.

Source Coverage
Launch parallel research streams for the following sources:
- Twitter/X: Find tweets, threads, replies, and discussions about [TOPIC]. Focus on recent sentiment, recurring talking points, and high-signal contributors.
- Reddit: Search relevant subreddits for posts and comments about [TOPIC]. Capture candid user pain points, skepticism, praise, and real-world use cases.
- Hacker News: Find stories and comment threads related to [TOPIC]. Focus on technical opinions, critical debates, and practitioner insight.
- YouTube: Find recent videos about [TOPIC]. For each relevant video, capture: title, channel, publish timing, approximate view count, primary angle, notable comment sentiment.
- Web / Blogs / Documentation: Search for blog posts, articles, product pages, changelogs, official docs, and expert commentary about [TOPIC]. Distinguish between: official sources, independent analysis, marketing content, technical documentation.

Required Research Method
For each platform, do all of the following:
- identify the top recurring themes
- extract specific insights
- capture both positive and negative opinions
- note who is saying what when relevant
- identify patterns repeated across multiple posts/sources
- surface contradictions or disagreements
- highlight blind spots / gaps: what people are not discussing yet
- include direct source links
Do not just summarize individual posts. Instead, perform pattern recognition and synthesis.

Evidence Standards
- Prioritize high-signal, non-duplicate, recent sources
- Avoid over-weighting viral but low-substance content
- Separate fact, opinion, and speculation
- When evidence is weak or mixed, explicitly say so
- If a source appears biased, promotional, or low-credibility, label it
- If the same claim appears across multiple platforms, mark it as a cross-platform pattern

Output Structure
Deep Research Report: [TOPIC]

1. Executive Summary
Provide a concise but insightful overview covering: current state of discussion around [TOPIC], why it matters now, dominant narratives, major tensions or uncertainties, overall momentum level (early / growing / crowded / declining).

2. Cross-Platform Key Themes and Patterns
Summarize the strongest recurring themes across all sources. For each theme include: theme name, what people are saying, platforms where it appears, whether sentiment is mostly positive, negative, or mixed, confidence level: High / Medium / Low.

3. Platform-by-Platform Findings
- Twitter/X: Include major discussion clusters, notable opinions, emerging narratives, representative sources, links.
- Reddit: Include recurring user concerns, practical use cases, skeptical takes, representative threads/comments, links.
- Hacker News: Include technical critiques, strong pro/con arguments, architectural or implementation concerns, representative threads, links.
- YouTube: Include most common video angles, what creators focus on, which topics appear to drive attention, comment sentiment patterns, representative videos with links.
- Web / Blogs / Docs: Include strongest articles and documentation, key product/official narratives, expert commentary, what is being explained well vs poorly, links.

4. Common Pain Points
List the most frequently mentioned frustrations, objections, limitations, or unmet needs. For each pain point include: description, who mentions it, where it appears, severity: High / Medium / Low, whether it is recurring across multiple platforms.

5. What’s Working Well vs. What’s Missing
- What’s Working Well: what people consistently praise, what seems mature, useful, or compelling, where adoption/value is clear.
- What’s Missing: weak spots, unanswered questions, unmet expectations, underdeveloped use cases, missing education, tooling, documentation, positioning, or trust.

6. Opportunities
Identify promising opportunities based on what is missing, under-discussed, or poorly served. For each opportunity include: opportunity title, why it matters, supporting signals from research, which audience would care most, estimated opportunity type (content angle, product feature, positioning angle, community play, research angle, GTM angle).

7. Gaps Nobody Is Talking About Yet
Surface overlooked or underexplored areas. These should be based on inference from the research, not guesswork. For each gap include: gap description, why it appears overlooked, why it may become important next, confidence level.

8. Source Library by Platform
Organize all links by platform: Twitter/X, Reddit, Hacker News, YouTube, Web / Blogs / Docs. For each source, include a short note on why it matters.

9. Final Strategic Takeaway
End with a concise synthesis: what the market/conversation is really signaling, what deserves attention now, what is still noise vs. signal, the 3 most actionable takeaways.

Formatting Rules
- Use clear headings and subheadings
- Use bullets for scanability, but keep insight depth high
- Be analytical, not verbose
- Avoid generic filler
- Distinguish clearly between: observed evidence, synthesized pattern, inferred opportunity
- Include tables when helpful for comparison
- Keep the tone sharp, strategic, and research-oriented

Quality Bar
The final output should feel like a cross between analyst research, community intelligence, and product strategy synthesis — not a loose collection of links. If coverage is thin on any platform, say so explicitly and compensate by extracting better synthesis from the stronger platforms. Before finishing, do a final pass to ensure: duplicate insights are merged, conflicting viewpoints are preserved, opportunities are grounded in evidence, all major claims are traceable to sources.`;

export default function App() {
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<'fast' | 'standard' | 'deep'>('deep');
  const [isResearching, setIsResearching] = useState(false);
  const [report, setReport] = useState('');
  const [error, setError] = useState('');
  const [groundingChunks, setGroundingChunks] = useState<any[]>([]);
  
  const reportContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of report while generating
  useEffect(() => {
    if (isResearching && reportContainerRef.current) {
      reportContainerRef.current.scrollTop = reportContainerRef.current.scrollHeight;
    }
  }, [report, isResearching]);

  const handleResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setIsResearching(true);
    setReport('');
    setError('');
    setGroundingChunks([]);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API Key is missing. Please configure it in the settings.");
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = SYSTEM_PROMPT_TEMPLATE.replace(/\[TOPIC\]/g, topic);

      let modelName = "gemini-3.1-pro-preview";
      let tools: any[] | undefined = undefined;
      let thinkingConfig: any = undefined;

      if (mode === 'fast') {
        modelName = "gemini-3.1-flash-lite-preview";
      } else if (mode === 'standard') {
        modelName = "gemini-3-flash-preview";
        tools = [{ googleSearch: {} }];
      } else if (mode === 'deep') {
        modelName = "gemini-3.1-pro-preview";
        tools = [{ googleSearch: {} }];
        thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      }

      const responseStream = await ai.models.generateContentStream({
        model: modelName,
        contents: prompt,
        config: {
          tools,
          thinkingConfig,
          systemInstruction: "You are an expert research analyst. Use Google Search to find the most recent and relevant information across Twitter, Reddit, Hacker News, YouTube, and the Web. Synthesize it into the requested format.",
        }
      });

      let fullText = '';
      for await (const chunk of responseStream) {
        if (chunk.text) {
          fullText += chunk.text;
          setReport(fullText);
        }
        
        // Capture grounding metadata if available
        if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
          setGroundingChunks(prev => {
            const newChunks = chunk.candidates![0].groundingMetadata!.groundingChunks || [];
            // Simple deduplication based on URI
            const existingUris = new Set(prev.map(c => c.web?.uri).filter(Boolean));
            const uniqueNewChunks = newChunks.filter(c => c.web?.uri && !existingUris.has(c.web.uri));
            return [...prev, ...uniqueNewChunks];
          });
        }
      }
    } catch (err: any) {
      console.error("Research error:", err);
      setError(err.message || "An error occurred during research.");
    } finally {
      setIsResearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <h1 className="font-semibold text-lg tracking-tight">Deep Research Orchestrator</h1>
          </div>
          <div className="text-xs font-medium text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full border border-neutral-200">
            Powered by Gemini 3.1 Pro
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">
        
        {/* Input Section */}
        <section className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6 sm:p-8">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight mb-2">What would you like to research?</h2>
            <p className="text-neutral-500 mb-6 text-sm">
              Enter a topic, product, trend, or technology. Our AI agents will scour Twitter, Reddit, Hacker News, YouTube, and the Web to synthesize a comprehensive strategy report.
            </p>
            
            <form onSubmit={handleResearch} className="flex flex-col gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button type="button" onClick={() => setMode('fast')} className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-colors ${mode === 'fast' ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600' : 'border-neutral-200 hover:border-indigo-300'}`}>
                  <Zap className={`w-5 h-5 ${mode === 'fast' ? 'text-indigo-600' : 'text-neutral-400'}`} />
                  <div>
                    <div className={`text-sm font-medium ${mode === 'fast' ? 'text-indigo-900' : 'text-neutral-700'}`}>Tốc độ cao</div>
                    <div className="text-xs text-neutral-500 mt-0.5">Flash Lite (Phản hồi nhanh)</div>
                  </div>
                </button>
                <button type="button" onClick={() => setMode('standard')} className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-colors ${mode === 'standard' ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600' : 'border-neutral-200 hover:border-indigo-300'}`}>
                  <Search className={`w-5 h-5 ${mode === 'standard' ? 'text-indigo-600' : 'text-neutral-400'}`} />
                  <div>
                    <div className={`text-sm font-medium ${mode === 'standard' ? 'text-indigo-900' : 'text-neutral-700'}`}>Tìm kiếm chuẩn</div>
                    <div className="text-xs text-neutral-500 mt-0.5">Flash + Google Search</div>
                  </div>
                </button>
                <button type="button" onClick={() => setMode('deep')} className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-colors ${mode === 'deep' ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600' : 'border-neutral-200 hover:border-indigo-300'}`}>
                  <BrainCircuit className={`w-5 h-5 ${mode === 'deep' ? 'text-indigo-600' : 'text-neutral-400'}`} />
                  <div>
                    <div className={`text-sm font-medium ${mode === 'deep' ? 'text-indigo-900' : 'text-neutral-700'}`}>Suy luận sâu</div>
                    <div className="text-xs text-neutral-500 mt-0.5">Pro + Thinking Mode</div>
                  </div>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-neutral-400" />
                  </div>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Nhập chủ đề nghiên cứu (VD: AI coding assistants, Solid-state batteries...)"
                    className="block w-full pl-10 pr-4 py-3 border border-neutral-300 rounded-xl bg-neutral-50 focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 focus:bg-white transition-colors text-sm sm:text-base outline-none"
                    disabled={isResearching}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!topic.trim() || isResearching}
                  className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-sm font-medium rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm whitespace-nowrap"
                >
                  {isResearching ? (
                    <>
                      <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                      Đang nghiên cứu...
                    </>
                  ) : (
                    <>
                      Bắt đầu
                      <ChevronRight className="ml-2 -mr-1 h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Research Failed</h3>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Results Section */}
        {(report || isResearching) && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* Main Report */}
            <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden flex flex-col h-[800px]">
              <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2 text-neutral-700">
                  <FileText className="w-4 h-4" />
                  <h3 className="font-medium text-sm">Research Synthesis</h3>
                </div>
                {isResearching && (
                  <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </span>
                    Agents are gathering data...
                  </div>
                )}
              </div>
              
              <div 
                ref={reportContainerRef}
                className="flex-1 overflow-y-auto p-6 sm:p-8 scroll-smooth"
              >
                {report ? (
                  <div className="prose prose-neutral prose-sm sm:prose-base max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-a:text-indigo-600 hover:prose-a:text-indigo-700 prose-a:no-underline hover:prose-a:underline prose-li:marker:text-neutral-400">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {report}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-neutral-400 space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                    <p className="text-sm">Initializing research agents and searching the web...</p>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar: Sources */}
            <div className="lg:col-span-1 flex flex-col gap-4">
              <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-5 h-[800px] flex flex-col">
                <div className="flex items-center gap-2 text-neutral-900 font-medium mb-4 pb-4 border-b border-neutral-100">
                  <BookOpen className="w-4 h-4 text-neutral-500" />
                  <h3>Live Sources</h3>
                </div>
                
                <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                  {groundingChunks.length > 0 ? (
                    groundingChunks.map((chunk, idx) => {
                      if (!chunk.web?.uri) return null;
                      
                      let domain = '';
                      let title = chunk.web.title || 'Nguồn Web';
                      try {
                        const urlObj = new URL(chunk.web.uri);
                        domain = urlObj.hostname.replace('www.', '');
                        
                        if (domain.includes('vertexaisearch.cloud.google.com')) {
                          domain = title;
                        }
                      } catch (e) {
                        domain = chunk.web.uri;
                      }

                      return (
                        <a 
                          key={idx}
                          href={chunk.web.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-3 rounded-xl border border-neutral-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors group"
                        >
                          <h4 className="text-xs font-medium text-neutral-900 line-clamp-2 group-hover:text-indigo-700 mb-1">
                            {title}
                          </h4>
                          <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
                            <span className="truncate">{domain !== title ? domain : 'Google Search'}</span>
                          </div>
                        </a>
                      );
                    })
                  ) : (
                    <div className="text-center text-sm text-neutral-400 py-8">
                      {isResearching ? "Đang tìm kiếm nguồn..." : "Chưa có nguồn nào."}
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
