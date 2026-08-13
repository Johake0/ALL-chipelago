export default function GamesPool({ games }) {
  return (
    <section className="panel pool-panel">
      <h2>Uncharted Games <span className="pool-count">({games.length})</span></h2>
      <div className="pool-grid">
        {games.map((g) => <span className="pool-pill" key={g.id}>{g.name}</span>)}
      </div>
    </section>
  )
}
