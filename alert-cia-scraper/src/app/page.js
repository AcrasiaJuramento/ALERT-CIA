import styles from "./page.module.css";

const endpoints = [
  { method: "GET", path: "/api/status", note: "Public health and progress check" },
  { method: "POST", path: "/api/run", note: "Authorized scraper refresh" },
  { method: "POST", path: "/api/analyze", note: "Authorized article analysis" },
  { method: "GET", path: "/api/vehicular", note: "Authorized vehicular scrape" },
  { method: "GET", path: "/api/incidents", note: "Authorized incident scrape" },
];

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.header}>
          <p className={styles.eyebrow}>ALERT-CIA</p>
          <h1>Scraper API</h1>
          <p className={styles.summary}>
            Bombo Radyo monitoring service for ALERT-CIA incident review.
          </p>
        </div>

        <div className={styles.statusRow}>
          <span className={styles.statusDot} aria-hidden="true" />
          <span>Deployment shell is live</span>
        </div>

        <div className={styles.endpointList} aria-label="Available API endpoints">
          {endpoints.map((endpoint) => (
            <a className={styles.endpoint} href={endpoint.path} key={endpoint.path}>
              <span className={styles.method}>{endpoint.method}</span>
              <span className={styles.path}>{endpoint.path}</span>
              <span className={styles.note}>{endpoint.note}</span>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
