const followingInput = document.getElementById('followingInput');
const followersInput = document.getElementById('followersInput');
const compareButton = document.getElementById('compareButton');
const resultsSection = document.getElementById('results');
const resultCount = resultsSection.querySelector('.result-count');
const resultList = resultsSection.querySelector('.result-list');

const normalizeUsernames = (rawText) => {
  return rawText
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^@+/, '').toLowerCase());
};

const buildProfileLink = (username) => `https://instagram.com/${username}/`;

const showEmptyState = () => {
  resultList.innerHTML = '';
  const emptyItem = document.createElement('li');
  emptyItem.className = 'empty-state';
  emptyItem.textContent = '¡Felicidades! Todos te siguen de vuelta.';
  resultList.appendChild(emptyItem);
};

compareButton.addEventListener('click', () => {
  const following = new Set(normalizeUsernames(followingInput.value));
  const followers = new Set(normalizeUsernames(followersInput.value));

  if (!following.size) {
    alert('Agrega al menos un usuario en la lista de seguidos.');
    followingInput.focus();
    return;
  }

  const notFollowingBack = Array.from(following).filter((user) => !followers.has(user));
  notFollowingBack.sort();

  resultsSection.classList.remove('hidden');

  resultCount.textContent = `${notFollowingBack.length} usuario(s) no te siguen de vuelta.`;

  resultList.innerHTML = '';

  if (!notFollowingBack.length) {
    showEmptyState();
    return;
  }

  notFollowingBack.forEach((username) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = buildProfileLink(username);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `@${username}`;
    item.appendChild(link);
    resultList.appendChild(item);
  });
});
