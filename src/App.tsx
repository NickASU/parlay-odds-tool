//App.tsx
import InputsPanel from "./components/InputsPanel";
import AnalysisPanel from "./components/AnalysisPanel";
import { ParlayProvider } from "./state/parlayStore";

export default function App() {
  return (
    <ParlayProvider>
      <div className="app">
        <div className="app-inner">
          <header className="site-header">
            <div className="site-logo">Parlay Odds Tool</div>
            <nav className="site-nav">
              <a href="#calculator" className="site-nav-link">
                Calculator
              </a>
              <a href="#how-it-works" className="site-nav-link">
                How it works
              </a>
            </nav>
          </header>

          <main className="site-main">
            <section className="hero" id="top">
              <div className="hero-content">
                <h1 className="hero-title">Parlay Analyzer</h1>
                <p className="hero-subtitle">
                  Live “remove a leg” preview. Check Pricing fairness.
                </p>

                <div className="hero-cta-row">
                  <a href="#calculator" className="btn hero-cta">
                    Open Calculator
                  </a>
                  <p className="hero-note">Check the math before placing the bet</p>
                </div>

                <div className="hero-badges">
                  <span className="hero-badge">Slip-style payout</span>
                  <span className="hero-badge">Remove-a-leg analysis</span>
                  <span className="hero-badge">P</span>
                </div>
              </div>
            </section>

            <section className="calculator-section" id="calculator">
              <header className="app-header">
                <h2 className="app-title">Parlay Calculator</h2>
                <p className="app-subtitle">
                  Build your slip.
                </p>
              </header>

              <div className="app-grid">
                <InputsPanel />

                <section className="card">
                  <div className="card-section card-section--with-header">
                    <h3 className="card-title">Parlay Outcome</h3>
                  </div>
                  <AnalysisPanel />
                </section>
              </div>
            </section>

            <section className="info-section" id="how-it-works">
              <h2 className="info-title">How it works</h2>
              <div className="info-grid">
                <div className="info-block">
                  <h3>Outcome</h3>
                  <p>Add or remove legs to check new odds.</p>
                </div>
                <div className="info-block">
                  <h3>Check Book vs Reality</h3>
                  <p>
                    See book offering vs what you should make.
                  </p>
                </div>
                <div className="info-block">
                  <h3>Download</h3>
                  <p>Export a clean slip image for sharing.</p>
                </div>
              </div>

              <p className="info-disclaimer">
                This is information, not betting advice. Know your limits and your local laws.
              </p>
            </section>
          </main>

          <footer className="site-footer">
            <span>Parlay Odds Tool</span>
            <span>Understand the numbers behind the slip.</span>
          </footer>
        </div>
      </div>
    </ParlayProvider>
  );
}
