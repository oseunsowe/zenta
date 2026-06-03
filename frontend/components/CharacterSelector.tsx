const characters = [
  { id: 'aria', name: 'Aria', tag: 'Warm companion' },
  { id: 'nova', name: 'Nova', tag: 'Playful guide' },
  { id: 'echo', name: 'Echo', tag: 'Calm confidant' },
];

export default function CharacterSelector() {
  return (
    <section className="character-selector">
      <h2>Character</h2>
      <div className="character-grid">
        {characters.map((character) => (
          <button key={character.id} type="button" className="character-card">
            <strong>{character.name}</strong>
            <span>{character.tag}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
