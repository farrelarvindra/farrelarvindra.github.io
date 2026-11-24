import { useState } from 'react'

const SAMPLE_PROJECTS = [
  {
    title: 'Project One',
    description: 'A short description of your featured GitHub project and the problem it solves.',
    tags: ['React', 'Tailwind CSS'],
    repoUrl: 'https://github.com/farrelarvindra',
  },
  {
    title: 'Project Two',
    description: 'Another project highlight showcasing your stack, architecture, or open-source work.',
    tags: ['JavaScript', 'Node.js'],
    repoUrl: 'https://github.com/farrelarvindra',
  },
  {
    title: 'Project Three',
    description: 'Add a live demo link or GitHub repository link to let visitors explore your code.',
    tags: ['UI/UX', 'DaisyUI'],
    repoUrl: 'https://github.com/farrelarvindra',
  },
]

export default function App() {
  const [theme, setTheme] = useState('dark')

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
  }

  return (
    <div className="min-h-screen bg-base-100 text-base-content flex flex-col">
      {/* Navbar */}
      <header className="navbar bg-base-100/80 backdrop-blur sticky top-0 z-50 border-b border-base-200 px-4 lg:px-8">
        <div className="flex-1">
          <a href="#" className="btn btn-ghost text-xl font-bold tracking-tight">
            farrelarvindra
          </a>
        </div>
        <nav className="flex items-center gap-2">
          <a href="#projects" className="btn btn-ghost btn-sm">
            Projects
          </a>
          <a href="#contact" className="btn btn-ghost btn-sm">
            Contact
          </a>
          <button
            type="button"
            onClick={toggleTheme}
            className="btn btn-ghost btn-sm"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {/* Hero */}
        <section className="hero py-20 lg:py-28 px-4">
          <div className="hero-content text-center max-w-2xl">
            <div>
              <div className="badge badge-primary badge-outline mb-4">
                Available for opportunities
              </div>
              <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight">
                Hi, I&apos;m Farrel Arvindra
              </h1>
              <p className="py-6 text-base-content/75 text-lg">
                Developer building clean, modern web applications. Replace this intro with your own
                bio, skills, and what you&apos;re currently working on.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <a href="#projects" className="btn btn-primary">
                  View Projects
                </a>
                <a
                  href="https://github.com/farrelarvindra"
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-outline"
                >
                  GitHub Profile
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Projects */}
        <section id="projects" className="max-w-5xl mx-auto px-4 py-12 lg:py-16">
          <div className="mb-8">
            <h2 className="text-3xl font-bold">Featured Projects</h2>
            <p className="text-base-content/70 mt-1">
              Selected repositories and things I&apos;ve built.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {SAMPLE_PROJECTS.map((project) => (
              <div
                key={project.title}
                className="card bg-base-200 border border-base-300 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="card-body">
                  <h3 className="card-title">{project.title}</h3>
                  <p className="text-sm text-base-content/75">{project.description}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {project.tags.map((tag) => (
                      <span key={tag} className="badge badge-ghost badge-sm">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="card-actions justify-end mt-4">
                    <a
                      href={project.repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-sm btn-primary btn-outline"
                    >
                      View Repo
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="max-w-3xl mx-auto px-4 py-16 text-center">
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body items-center text-center">
              <h2 className="card-title text-2xl">Get in Touch</h2>
              <p className="text-base-content/75 max-w-md">
                Have a project in mind or just want to say hi? Feel free to reach out.
              </p>
              <div className="card-actions mt-4">
                <a href="mailto:hello@example.com" className="btn btn-primary">
                  Say Hello
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="footer footer-center p-6 bg-base-200 text-base-content/70 border-t border-base-300">
        <p>© {new Date().getFullYear()} Farrel Arvindra. Built with React, Tailwind CSS &amp; DaisyUI.</p>
      </footer>
    </div>
  )
}
