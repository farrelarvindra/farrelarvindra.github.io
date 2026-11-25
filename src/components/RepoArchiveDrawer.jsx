import { useEffect, useMemo, useState } from 'react'
import { PORTFOLIO_DATA } from '../data/portfolio'

const LANGUAGE_COLORS = {
  JavaScript: '#ffd00c',
  TypeScript: '#00d2ff',
  Python: '#10e476',
  HTML: '#ff6210',
  CSS: '#9234ff',
  GLSL: '#ff2044',
  Rust: '#ff7b29',
  Go: '#00d2ff',
  Java: '#ff6210',
  'C++': '#ff2044',
  C: '#94a3b8',
}

export default function RepoArchiveDrawer({ isOpen, onClose, repos, status }) {
  const [query, setQuery] = useState('')
  const [selectedLang, setSelectedLang] = useState('ALL')

  // Close drawer cleanly on ESC & lock background scroll while open
  useEffect(() => {
    if (!isOpen) return undefined
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, onClose])

  const languages = useMemo(() => {
    const counts = new Map()
    for (const r of repos) {
      const lang = r.language || 'OTHER'
      counts.set(lang, (counts.get(lang) || 0) + 1)
    }
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([lang]) => lang)
    return ['ALL', ...sorted]
  }, [repos])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return repos.filter((r) => {
      const lang = r.language || 'OTHER'
      if (selectedLang !== 'ALL' && lang !== selectedLang) return false
      if (!q) return true
      return (
        r.name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        lang.toLowerCase().includes(q)
      )
    })
  }, [repos, query, selectedLang])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="All GitHub Repositories"
      className="fixed inset-0 z-50 flex justify-end"
    >
      {/* Pitch-dark backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-[#020204]/85 backdrop-blur-md transition-opacity"
      />

      {/* Frameless Archive Panel bounded by a razor-thin vertical spectral hairline */}
      <aside className="relative z-10 w-full max-w-2xl h-full bg-[#020204]/95 flex flex-col overflow-hidden">
        {/* Left vertical spectral seam */}
        <div
          aria-hidden="true"
          className="absolute left-0 top-0 bottom-0 w-px opacity-55"
          style={{
            background:
              'linear-gradient(180deg, transparent 0%, #9234ff 22%, #00d2ff 45%, #ffd00c 72%, #ff2044 90%, transparent 100%)',
          }}
        />

        {/* Header */}
        <div className="px-6 md:px-10 pt-8 pb-6 border-b border-white/[0.08] flex items-start justify-between gap-4">
          <div>
            <div className="font-pf-label text-[11px] uppercase text-white/40 flex items-center gap-2">
              <span>GITHUB ARCHIVE</span>
              <span className="text-white/20">·</span>
              <span>@{PORTFOLIO_DATA.githubUsername}</span>
              {status === 'fallback' && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="text-amber-300/75">PLACEHOLDER FALLBACK</span>
                </>
              )}
            </div>
            <h2 className="font-pf-main font-normal text-2xl md:text-3xl uppercase text-white/95 mt-1.5">
              All Repositories ({repos.length})
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="font-pf-label text-[12px] uppercase text-white/55 hover:text-white transition-colors cursor-pointer py-1"
          >
            CLOSE ×
          </button>
        </div>

        {/* Minimal Search & Language Filters (pinkfloyd.com frameless input & hairline tabs) */}
        <div className="px-6 md:px-10 py-4 border-b border-white/[0.06] space-y-3.5">
          <div className="flex items-center gap-3 border-b border-white/[0.12] pb-2">
            <span className="font-pf-label text-[11px] uppercase text-white/35">FILTER</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search repository name, stack, or description..."
              className="w-full bg-transparent text-[13px] font-pf-main text-white/90 placeholder:text-white/25 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="font-pf-label text-[11px] uppercase text-white/40 hover:text-white cursor-pointer"
              >
                CLEAR
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {languages.map((lang) => {
              const active = selectedLang === lang
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setSelectedLang(lang)}
                  className={`font-pf-label text-[11px] uppercase transition-colors cursor-pointer ${
                    active
                      ? 'text-white border-b border-amber-300 pb-0.5'
                      : 'text-white/35 hover:text-white/75'
                  }`}
                >
                  {lang}
                </button>
              )
            })}
          </div>
        </div>

        {/* Repository List */}
        <div className="flex-1 overflow-y-auto px-6 md:px-10 py-2">
          {status === 'loading' ? (
            <div className="py-20 text-center font-pf-label text-[12px] uppercase text-white/40">
              SYNCING REPOSITORIES FROM GITHUB...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center font-pf-label text-[12px] uppercase text-white/35">
              NO MATCHING REPOSITORIES FOUND
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {filtered.map((repo, idx) => {
                const langColor = LANGUAGE_COLORS[repo.language] || '#94a3b8'
                const year = repo.updated_at ? repo.updated_at.slice(0, 4) : '—'
                return (
                  <li key={repo.id} className="py-5 group">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-pf-label text-[11px] text-white/25 tabular-nums">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <a
                            href={repo.html_url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-pf-main font-medium text-[15px] uppercase text-white/90 group-hover:text-amber-200 transition-colors truncate"
                          >
                            {repo.name}
                          </a>
                          {repo.fork && (
                            <span className="font-pf-label text-[10px] uppercase text-white/30">
                              [FORK]
                            </span>
                          )}
                          {repo.isPlaceholder && (
                            <span className="font-pf-label text-[10px] uppercase text-amber-300/60">
                              [PLACEHOLDER]
                            </span>
                          )}
                        </div>

                        <p className="font-pf-main text-[13px] text-white/45 leading-[1.45] pl-7">
                          {repo.description || 'No description provided yet.'}
                        </p>

                        <div className="flex items-center gap-5 pl-7 pt-1 font-pf-label text-[11px] uppercase text-white/35">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: langColor }}
                            />
                            {repo.language || 'OTHER'}
                          </span>
                          <span className="tabular-nums">★ {repo.stargazers_count ?? 0}</span>
                          <span className="tabular-nums">{year}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0 pt-0.5">
                        <a
                          href={repo.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-pf-label text-[11px] uppercase text-white/55 hover:text-white transition-colors"
                        >
                          CODE →
                        </a>
                        {repo.homepage && (
                          <a
                            href={repo.homepage}
                            target="_blank"
                            rel="noreferrer"
                            className="font-pf-label text-[11px] uppercase text-cyan-300/70 hover:text-cyan-200 transition-colors"
                          >
                            LIVE →
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 md:px-10 py-4 border-t border-white/[0.06] flex items-center justify-between font-pf-label text-[11px] uppercase text-white/40">
          <span>SHOWING {filtered.length} OF {repos.length}</span>
          <a
            href={PORTFOLIO_DATA.socials.github}
            target="_blank"
            rel="noreferrer"
            className="text-white/70 hover:text-white transition-colors"
          >
            OPEN GITHUB PROFILE →
          </a>
        </div>
      </aside>
    </div>
  )
}
