interface UserCardProps {
  readonly name: string;
}

export function UserCard({ name }: UserCardProps) {
  return (
    <section className="user-card">
      <h2>Profile</h2>
      <p>This is your public profile.</p>
      <button aria-label="Close profile" onClick={() => undefined}>
        Close
      </button>
      <span>{name}</span>
    </section>
  );
}
