import { useEffect, useRef } from 'react';

// Fictional profile for interface testing only; no account or persistence.
const profile = {
  name: 'Alice Tan',
  username: 'alice.tan',
  dateOfBirth: '1 January 2000',
  email: 'alice.tan@example.com',
  gender: 'Female',
};

export default function UserProfile({ onBack }) {
  const headingRef = useRef(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="user-profile" aria-labelledby="profile-heading">
      <button className="button button--quiet" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> Back
      </button>
      <div className="user-profile__card">
        <span className="user-profile__avatar" aria-hidden="true">
          A
        </span>
        <p className="eyebrow">YOUR WORKSPACE</p>
        <h1 id="profile-heading" tabIndex={-1} ref={headingRef}>
          User Profile
        </h1>
        <p className="user-profile__note">
          Demo profile · These details are fictional and used for UI testing.
        </p>
        <dl className="user-profile__details">
          {[
            ['Name', profile.name],
            ['Username', profile.username],
            ['Date of birth', profile.dateOfBirth],
            ['Email', profile.email],
            ['Gender', profile.gender],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
