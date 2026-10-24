import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

type Generator = {
  id: string
  number: string
  name: string
  title: string
  description: string
  image: string
  tag: string
  promptLead: string
}

const generators: Generator[] = [
  {
    id: 'ugc',
    number: '01',
    name: 'UGC GENERATOR',
    title: 'Make it feel real.',
    description: 'Creator-led product stories with a natural point of view.',
    image: 'photo-1534528741775-53994a69daeb',
    tag: 'CREATOR CONTENT',
    promptLead: 'Create a natural UGC video featuring',
  },
  {
    id: 'faceless',
    number: '02',
    name: 'FACELESS GENERATOR',
    title: 'Let the story lead.',
    description: 'Scroll-stopping visuals, voiceover, and product moments.',
    image: 'photo-1470252649378-9c29740c9fa8',
    tag: 'VOICEOVER + VISUALS',
    promptLead: 'Create a faceless short-form video about',
  },
  {
    id: 'ugc-own',
    number: '03',
    name: 'UGC OWN CREATIVE',
    title: 'Your vision, in frame.',
    description: 'Shape a creator brief around your own creative direction.',
    image: 'photo-1529139574466-a303027c1d8b',
    tag: 'CUSTOM CREATIVE',
    promptLead: 'Direct a creator to bring this custom UGC concept to life:',
  },
  {
    id: 'faceless-own',
    number: '04',
    name: 'FACELESS OWN CREATIVE',
    title: 'Build your own world.',
    description: 'Turn a distinct visual idea into a faceless ad concept.',
    image: 'photo-1518837695005-2083093ee35b',
    tag: 'CUSTOM CREATIVE',
    promptLead: 'Build a faceless visual story from this creative direction:',
  },
  {
    id: 'drama',
    number: '05',
    name: 'AI.DRAMA STORY',
    title: 'A little more drama.',
    description: 'Cinematic characters, high stakes, and an impossible hook.',
    image: 'photo-1519608487953-e999c86e7455',
    tag: 'CINEMATIC STORY',
    promptLead: 'Write a dramatic, cinematic short-form story about',
  },
  {
    id: 'storyboard',
    number: '06',
    name: 'STORYBOARD',
    title: 'See every scene.',
    description: 'Break an idea into a shoot-ready sequence of frames.',
    image: 'photo-1485846234645-a62644f84728',
    tag: 'SHOT BY SHOT',
    promptLead: 'Storyboard a short-form video about',
  },
]

function App() {
  const [activeGenerator, setActiveGenerator] = useState<Generator | null>(null)
  const [brief, setBrief] = useState('')
  const [tone, setTone] = useState('Warm & honest')
  const [result, setResult] = useState('')
  const [copied, setCopied] = useState(false)

  function openGenerator(generator: Generator) {
    setActiveGenerator(generator)
    setBrief('')
    setResult('')
    setCopied(false)
  }

  function createPrompt() {
    if (!activeGenerator || !brief.trim()) return
    setResult(
      `${activeGenerator.promptLead} ${brief.trim()}. Keep the tone ${tone.toLowerCase()}. Open with a compelling first-second hook, build a clear emotional or practical payoff, and close with a natural call to action. Use vivid, specific details and a polished, platform-native style.`,
    )
    setCopied(false)
  }

  async function copyPrompt() {
    if (!result) return
    await navigator.clipboard.writeText(result)
    setCopied(true)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setActiveGenerator(null)} aria-label="Go to home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>UNIVERSAL<span className="brand-light"> / STUDIO</span></span>
        </button>
        <div className="topbar-meta"><span className="status-dot" /> CREATIVE ENGINE <span className="meta-divider">/</span> 01.26</div>
        <button className="topbar-link" onClick={() => setActiveGenerator(null)}>
          {activeGenerator ? 'ALL GENERATORS' : 'WORKSPACE'} <span aria-hidden="true">↗</span>
        </button>
      </header>

      {activeGenerator ? (
        <section className="workspace">
          <button className="back-link" onClick={() => setActiveGenerator(null)}><span aria-hidden="true">←</span> ALL GENERATORS</button>
          <div className="workspace-heading">
            <div className="eyebrow"><span className="eyebrow-line" /> {activeGenerator.number} / {activeGenerator.tag}</div>
            <h1>{activeGenerator.name}</h1>
            <p>{activeGenerator.description}</p>
          </div>
          <div className="workspace-grid">
            <section className="editor-panel">
              <div className="panel-heading"><span>01</span><h2>Set the scene</h2></div>
              <label htmlFor="brief">YOUR CREATIVE BRIEF</label>
              <textarea
                id="brief"
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                placeholder="What are we making? Add a product, idea, audience, or moment..."
                rows={7}
              />
              <label htmlFor="tone">CREATIVE TONE</label>
              <select id="tone" value={tone} onChange={(event) => setTone(event.target.value)}>
                <option>Warm &amp; honest</option>
                <option>Bold &amp; playful</option>
                <option>Quietly cinematic</option>
                <option>Direct &amp; confident</option>
              </select>
              <button className="generate-button" onClick={createPrompt} disabled={!brief.trim()}>
                GENERATE PROMPT <span aria-hidden="true">↗</span>
              </button>
            </section>
            <section className="result-panel" aria-live="polite">
              <div className="panel-heading"><span>02</span><h2>Your direction</h2></div>
              {result ? (
                <>
                  <p className="result-copy">{result}</p>
                  <button className="copy-button" onClick={copyPrompt}>{copied ? 'COPIED' : 'COPY PROMPT'} <span aria-hidden="true">{copied ? '✓' : '↗'}</span></button>
                </>
              ) : (
                <div className="result-empty"><span className="result-spark" aria-hidden="true">✳</span><p>Your next idea starts here.</p><span>ADD A BRIEF TO GENERATE YOUR CREATIVE DIRECTION</span></div>
              )}
            </section>
          </div>
        </section>
      ) : (
        <>
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow"><span className="eyebrow-line" /> YOUR CREATIVE STARTING POINT</div>
              <h1>Make something<br /><span>worth watching.</span></h1>
              <p>Six ways into your next great idea.<br className="desktop-break" /> Pick a studio and make it yours.</p>
            </div>
            <div className="hero-index" aria-hidden="true"><span>CREATIVE INDEX</span><strong>06</strong><i>STUDIOS AVAILABLE</i></div>
          </section>

          <section className="generator-section" aria-label="Creative generators">
            <div className="section-heading"><h2>CHOOSE YOUR STUDIO</h2><span>01 — 06 <i /></span></div>
            <div className="generator-grid">
              {generators.map((generator) => (
                <button className="generator-card" key={generator.id} onClick={() => openGenerator(generator)}>
                  <img src={`https://images.unsplash.com/${generator.image}?auto=format&fit=crop&w=1000&q=85`} alt="" loading="lazy" />
                  <span className="card-shade" />
                  <span className="card-top"><span>{generator.number} / STUDIO</span><span className="card-arrow" aria-hidden="true">↗</span></span>
                  <span className="card-content"><span className="card-tag">{generator.tag}</span><span className="card-title">{generator.name}</span><span className="card-description">{generator.description}</span></span>
                  <span className="card-edge" />
                </button>
              ))}
            </div>
          </section>
          <footer className="footer"><span>UNIVERSAL AI PROMPT STUDIO</span><span>MAKE THE IDEA REAL <i>✳</i></span></footer>
        </>
      )}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)