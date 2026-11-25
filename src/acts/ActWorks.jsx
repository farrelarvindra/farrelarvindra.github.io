import { useEffect, useState } from 'react'
import RepoArchiveDrawer from '../components/RepoArchiveDrawer'
import { PORTFOLIO_DATA } from '../data/portfolio'
import { spectralRGB } from '../utils/optics'

export default function ActWorks() {
  const [activeIdx, setActiveIdx] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [repos, setRepos] = useState(PORTFOLIO_DATA.placeholderRepos)
  const [repoStatus, setRepoStatus] = useState('loading')

  const projects = PORTFOLIO_DATA.featuredProjects
  const activeProject = projects[activeIdx]
  const [actR, actG, actB] = spectralRGB(activeProject.uColor)

  useEffect(() => {
    const controller = new AbortController()
    const url = `https://api.github.com/users/${PORTFOLIO_DATA.githubUsername}/repos?sort=updated&per_page=100`

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('GitHub API request failed')
        return res.json()
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setRepos(data)
          setRepoStatus('live')
        } else {
          setRepos(PORTFOLIO_DATA.placeholderRepos)
          setRepoStatus('fallback')
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setRepos(PORTFOLIO_DATA.placeholderRepos)
        setRepoStatus('fallback')
      })

    return () => controller.abort()
  }, [])

  return (
    <>
      <section
        id="works"
        aria-label="Selected Works & GitHub Archive"
        className="relative min-h-[90svh] w-full flex flex-col justify-between px-6 md:px-11 py-24 md:py-28 overflow-hidden"
      >
        {/* Top optical thread continuing smoothly from the Breathe Eclipse */}
        <div
          aria-hidden="true"
          className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-14 z-10 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(0, 210, 255, 0.35) 0%, rgba(255, 180, 70, 0.14) 65%, transparent 100%)',
          }}
        />

        <div className="relative z-10 max-w-6xl w-full mx-auto flex-1 flex flex-col justify-center space-y-12">
          {/* Header Row */}
          <div className="flex flex-wrap items-end justify-between gap-6 border-b border-white/[0.1] pb-6">
            <div className="space-y-1.5">
              <div className="font-pf-label text-[11px] uppercase text-white/40">
                02 // {PORTFOLIO_DATA.actTwo.eyebrow}
              </div>
              <h2 className="font-pf-main font-normal text-3xl sm:text-5xl uppercase leading-[1.06] text-white/95">
                {PORTFOLIO_DATA.actTwo.heading}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="font-pf-label text-[12px] uppercase text-white/85 hover:text-amber-300 transition-colors cursor-pointer pb-1 border-b border-white/25 hover:border-amber-300"
            >
              ALL REPOSITORIES ({repos.length}) →
            </button>
          </div>

          {/* Frameless pinkfloyd.com Editorial Works List + Active Wavelength Dossier */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            {/* Left: Bare typographic project index */}
            <ul className="lg:col-span-7 divide-y divide-white/[0.08]">
              {projects.map((p, idx) => {
                const isActive = idx === activeIdx
                const [r, g, b] = spectralRGB(p.uColor)
                const color = `rgb(${r}, ${g}, ${b})`
                return (
                  <li
                    key={p.id}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => setActiveIdx(idx)}
                    className="py-5 cursor-pointer group flex items-center justify-between gap-6 transition-colors"
                  >
                    <div className="flex items-baseline gap-5 min-w-0">
                      <span className="font-pf-label text-[11px] text-white/30 tabular-nums">
                        {p.num}
                      </span>
                      <div className="min-w-0">
                        <div
                          className={`font-pf-main text-xl sm:text-2xl uppercase tracking-[-0.01em] transition-colors truncate ${
                            isActive ? 'text-white' : 'text-white/50 group-hover:text-white/85'
                          }`}
                        >
                          {p.title}
                        </div>
                        <div className="font-pf-label text-[11px] uppercase text-white/35 mt-1 flex items-center gap-2">
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor: color,
                              boxShadow: isActive ? `0 0 8px ${color}` : 'none',
                            }}
                          />
                          <span>{p.wave}</span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`font-pf-label text-[11px] uppercase shrink-0 transition-colors ${
                        isActive ? 'text-white' : 'text-white/25 group-hover:text-white/60'
                      }`}
                    >
                      {p.year} →
                    </span>
                  </li>
                )
              })}
            </ul>

            {/* Right: Focused Project Specification */}
            <div className="lg:col-span-5 lg:border-l lg:border-white/[0.08] lg:pl-10 space-y-5 pt-2">
              <div className="flex items-center justify-between font-pf-label text-[11px] uppercase">
                <span
                  className="flex items-center gap-2"
                  style={{ color: `rgb(${actR}, ${actG}, ${actB})` }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: `rgb(${actR}, ${actG}, ${actB})`,
                      boxShadow: `0 0 10px rgb(${actR}, ${actG}, ${actB})`,
                    }}
                  />
                  {activeProject.wave}
                </span>
                <span className="text-white/35 tabular-nums">
                  {activeProject.num} / 0{projects.length}
                </span>
              </div>

              <h3 className="font-pf-main font-medium text-2xl uppercase text-white/95 leading-[1.15]">
                {activeProject.title}
              </h3>

              <p className="font-pf-main text-[14px] text-white/55 leading-[1.55]">
                {activeProject.description}
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/[0.06] font-pf-label text-[11px] uppercase text-white/40">
                {activeProject.tags.map((tag, i) => (
                  <span key={tag} className="flex items-center gap-3">
                    {i > 0 && <span className="text-white/15">·</span>}
                    {tag}
                  </span>
                ))}
              </div>

              <div className="pt-3 flex items-center gap-6 font-pf-label text-[12px] uppercase">
                <a
                  href={activeProject.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white/90 hover:text-amber-300 transition-colors"
                >
                  SOURCE CODE →
                </a>
                {activeProject.liveUrl && (
                  <a
                    href={activeProject.liveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-300/80 hover:text-white transition-colors"
                  >
                    LIVE PREVIEW →
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom optical thread leading into Act III */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-14 z-10 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, transparent 0%, rgba(146, 52, 255, 0.25) 60%, rgba(255, 255, 255, 0.22) 100%)',
          }}
        />
      </section>

      <RepoArchiveDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        repos={repos}
        status={repoStatus}
      />
    </>
  )
}
