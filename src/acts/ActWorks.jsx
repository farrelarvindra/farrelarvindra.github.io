import { useEffect, useState } from 'react'
import RepoArchiveDrawer from '../components/RepoArchiveDrawer'
import { PORTFOLIO_DATA } from '../data/portfolio'

const LANGUAGE_COLORS = {
  JavaScript: '#ffd00c',
  TypeScript: '#00d2ff',
  Go: '#00d2ff',
  Python: '#10e476',
  HTML: '#ff6210',
  CSS: '#9234ff',
  Rust: '#ff7b29',
  Java: '#ff6210',
  'C++': '#ff2044',
  C: '#94a3b8',
}

export default function ActWorks() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [repos, setRepos] = useState([])
  const [repoStatus, setRepoStatus] = useState('loading')

  useEffect(() => {
    const controller = new AbortController()
    const url = `https://api.github.com/users/${PORTFOLIO_DATA.githubUsername}/repos?sort=updated&per_page=100`

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('GitHub API request failed')
        return res.json()
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setRepos(data)
          setRepoStatus('live')
        } else {
          setRepos([])
          setRepoStatus('error')
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setRepos([])
        setRepoStatus('error')
      })

    return () => controller.abort()
  }, [])

  const recentRepos = repos.slice(0, 6)
  const { eyebrow, heading, emptyHeadline, emptyBody } = PORTFOLIO_DATA.actTwo

  return (
    <>
      <section
        id="works"
        aria-label="Projects & GitHub Repositories"
        className="relative min-h-[82svh] w-full flex flex-col justify-between px-6 md:px-11 py-24 md:py-28 overflow-hidden"
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
                02 // {eyebrow}
              </div>
              <h2 className="font-pf-main font-normal text-3xl sm:text-5xl uppercase leading-[1.06] text-white/95">
                {heading}
              </h2>
            </div>

            {repos.length > 0 && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="font-pf-label text-[12px] uppercase text-white/85 hover:text-amber-300 transition-colors cursor-pointer pb-1 border-b border-white/25 hover:border-amber-300"
              >
                ALL REPOSITORIES ({repos.length}) →
              </button>
            )}
          </div>

          {/* Honest Editorial Layout: Empty Featured State + Real Live GitHub Log */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            {/* Left: Honest Current Status */}
            <div className="lg:col-span-5 space-y-5 pt-1">
              <h3 className="font-pf-main font-normal text-2xl sm:text-3xl uppercase text-white/90 leading-[1.15]">
                {emptyHeadline}
              </h3>

              <p className="font-pf-main text-[14.5px] text-white/50 leading-[1.6] max-w-md">
                {emptyBody}
              </p>

              <div className="pt-3 flex flex-wrap items-center gap-6 font-pf-label text-[12px] uppercase">
                <a
                  href={PORTFOLIO_DATA.socials.github}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white/90 hover:text-amber-300 transition-colors"
                >
                  GITHUB PROFILE →
                </a>
                {repos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    className="text-white/45 hover:text-white transition-colors cursor-pointer"
                  >
                    BROWSE ARCHIVE
                  </button>
                )}
              </div>
            </div>

            {/* Right: Live Recent Public Repositories straight from GitHub (zero fake projects) */}
            <div className="lg:col-span-7 lg:border-l lg:border-white/[0.08] lg:pl-10 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.08] font-pf-label text-[10.5px] uppercase text-white/40">
                <span>RECENT ON GITHUB</span>
                <span>@{PORTFOLIO_DATA.githubUsername}</span>
              </div>

              {repoStatus === 'loading' ? (
                <div className="py-12 font-pf-label text-[11px] uppercase text-white/35">
                  LOADING REPOSITORIES...
                </div>
              ) : recentRepos.length === 0 ? (
                <div className="py-12 font-pf-label text-[11px] uppercase text-white/35">
                  COULD NOT LOAD GITHUB REPOSITORIES —{' '}
                  <a
                    href={PORTFOLIO_DATA.socials.github}
                    target="_blank"
                    rel="noreferrer"
                    className="text-white/75 hover:text-white underline underline-offset-4"
                  >
                    OPEN GITHUB →
                  </a>
                </div>
              ) : (
                <ul className="divide-y divide-white/[0.07]">
                  {recentRepos.map((repo, idx) => {
                    const langColor = LANGUAGE_COLORS[repo.language] || '#94a3b8'
                    const year = repo.updated_at ? repo.updated_at.slice(0, 4) : '—'
                    return (
                      <li key={repo.id} className="py-3.5 group">
                        <a
                          href={repo.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-baseline justify-between gap-4"
                        >
                          <div className="flex items-baseline gap-4 min-w-0">
                            <span className="font-pf-label text-[10.5px] text-white/25 tabular-nums shrink-0">
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <div className="min-w-0">
                              <div className="font-pf-main text-base sm:text-lg text-white/80 group-hover:text-white transition-colors truncate">
                                {repo.name}
                              </div>
                              {repo.description && (
                                <p className="font-pf-main text-[12.5px] text-white/40 mt-0.5 truncate">
                                  {repo.description}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-4 shrink-0 font-pf-label text-[10.5px] uppercase text-white/35">
                            {repo.language && (
                              <span className="hidden sm:inline-flex items-center gap-1.5">
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: langColor }}
                                />
                                {repo.language}
                              </span>
                            )}
                            <span className="tabular-nums">{year}</span>
                            <span className="text-white/30 group-hover:text-white transition-colors">
                              →
                            </span>
                          </div>
                        </a>
                      </li>
                    )
                  })}
                </ul>
              )}
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
