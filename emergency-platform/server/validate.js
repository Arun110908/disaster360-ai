const CATEGORIES = ['fire', 'accident', 'medical', 'flood', 'collapse', 'other'];
export function validateIncident(b) {
  const errors = {};
  const title = String(b.title ?? '').trim();
  const description = String(b.description ?? '').trim();
  const location = String(b.location ?? '').trim();
  const contact = String(b.contact ?? '').trim();
  const people = Number(b.peopleAffected);

  if (title.length < 5) errors.title = 'Title must be at least 5 characters';
  else if (title.length > 120) errors.title = 'Title must be 120 characters or fewer';
  if (description.length < 10) errors.description = 'Description must be at least 10 characters';
  else if (description.length > 1000) errors.description = 'Description must be 1000 characters or fewer';
  if (!CATEGORIES.includes(b.category)) errors.category = 'Select an emergency category';
  if (location.length < 3) errors.location = 'Location is required';
  if (b.peopleAffected === '' || b.peopleAffected == null || !Number.isInteger(people) || people < 0 || people > 100000)
    errors.peopleAffected = 'Enter a whole number between 0 and 100000';
  if (contact && !/^[+\d][\d\s\-()]{6,17}$|^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact))
    errors.contact = 'Enter a valid phone number or email';

  return {
    errors,
    value: { title, description, category: b.category, location, peopleAffected: people, contact: contact || null },
  };
}

