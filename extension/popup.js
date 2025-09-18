const followingInput = document.getElementById('followingInput');
const followersInput = document.getElementById('followersInput');
const compareButton = document.getElementById('compareButton');
const autoFetchButton = document.getElementById('autoFetchButton');
const resultsSection = document.getElementById('results');
const resultCount = resultsSection.querySelector('.result-count');
const resultList = resultsSection.querySelector('.result-list');
const statusMessage = document.getElementById('statusMessage');

const STATUS_MODIFIERS = ['status--success', 'status--warning', 'status--error'];

const setStatus = (message, type = 'info') => {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent = message;
  statusMessage.classList.remove('hidden', ...STATUS_MODIFIERS);

  if (type !== 'info') {
    statusMessage.classList.add(`status--${type}`);
  }
};

const clearStatus = () => {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent = '';
  statusMessage.classList.add('hidden');
  statusMessage.classList.remove(...STATUS_MODIFIERS);
};

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

autoFetchButton?.addEventListener('click', async () => {
  clearStatus();

  autoFetchButton.disabled = true;
  compareButton.disabled = true;
  setStatus('Iniciando lectura automática...', 'info');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      throw new Error('No se pudo identificar la pestaña activa.');
    }

    if (!tab.url || !tab.url.startsWith('https://www.instagram.com/')) {
      throw new Error('Abre tu perfil de Instagram y vuelve a intentarlo.');
    }

    setStatus('Leyendo tus seguidores y seguidos en Instagram...', 'info');

    const [injectionResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        const waitFor = async (conditionFn, timeout = 10000, interval = 100, timeoutMessage = 'timeout') => {
          const start = Date.now();
          while (Date.now() - start < timeout) {
            const value = conditionFn();
            if (value) {
              return value;
            }
            await sleep(interval);
          }
          throw new Error(timeoutMessage);
        };

        const parseCountText = (textContent) => {
          if (!textContent) {
            return 0;
          }

          const normalized = textContent.toLowerCase();
          if (!/(k|m|b|mil)/.test(normalized)) {
            const digits = normalized.replace(/\D/g, '');
            return digits ? parseInt(digits, 10) : 0;
          }

          const numberMatch = normalized.match(/[\d.,]+/);
          if (!numberMatch) {
            return 0;
          }

          const numeric = parseFloat(numberMatch[0].replace(/,/g, '.'));
          if (Number.isNaN(numeric)) {
            return 0;
          }

          let multiplier = 1;
          if (normalized.includes('mil') || normalized.includes('k')) {
            multiplier = 1_000;
          } else if (normalized.includes('m')) {
            multiplier = 1_000_000;
          } else if (normalized.includes('b')) {
            multiplier = 1_000_000_000;
          }

          return Math.round(numeric * multiplier);
        };

        const extractUsernameFromHref = (href) => {
          if (!href) {
            return null;
          }

          const sanitized = href.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
          const cleanPath = sanitized.replace(/^\/+|\/+$/g, '');
          if (!cleanPath) {
            return null;
          }

          const [username] = cleanPath.split('/');
          return username ? username.toLowerCase() : null;
        };

        const findScrollableParent = (element) => {
          let current = element;
          while (current && current !== document.body) {
            const hasScroll = current.scrollHeight > current.clientHeight + 5;
            if (hasScroll) {
              return current;
            }
            current = current.parentElement;
          }
          return element;
        };

        const closeActiveDialog = async () => {
          const dialog = document.querySelector('div[role="dialog"]');
          if (!dialog) {
            return;
          }

          const closeButton = dialog.querySelector(
            'button[aria-label="Cerrar"], button[aria-label="Close"], div[role="button"][aria-label="Cerrar"], div[role="button"][aria-label="Close"]'
          );

          if (closeButton) {
            closeButton.click();
          } else {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, which: 27, bubbles: true }));
            document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', keyCode: 27, which: 27, bubbles: true }));
          }

          await sleep(400);
          try {
            await waitFor(
              () => !document.querySelector('div[role="dialog"]'),
              3_000,
              100,
              'No se pudo cerrar una ventana emergente de Instagram.'
            );
          } catch (error) {
            console.warn(error);
          }
        };

        const collectList = async (type) => {
          const label = type === 'followers' ? 'seguidores' : 'seguidos';
          await closeActiveDialog();

          const selectors = [`a[href$="/${type}/"]`, `a[href*="/${type}/?"]`, `a[href$="/${type}"]`];
          let trigger = null;

          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
              trigger = element;
              break;
            }
          }

          if (!trigger) {
            throw new Error(`No se encontró el acceso directo a tus ${label} en el perfil actual.`);
          }

          const total = parseCountText(trigger.textContent);
          trigger.click();

          const dialog = await waitFor(
            () => document.querySelector('div[role="dialog"]'),
            10_000,
            100,
            'No se pudo abrir la ventana con la lista solicitada.'
          );
          const list = await waitFor(
            () => dialog.querySelector('ul'),
            10_000,
            100,
            'No se pudo cargar la lista de usuarios desde Instagram.'
          );
          const scrollContainer = findScrollableParent(list);

          const collectUsernames = () => {
            const items = Array.from(dialog.querySelectorAll('ul li'));
            const seen = new Set();
            const usernames = [];

            for (const item of items) {
              const anchor = item.querySelector('a[href^="/"][role="link"]');
              const username = extractUsernameFromHref(anchor?.getAttribute('href'));
              if (!username || seen.has(username)) {
                continue;
              }
              seen.add(username);
              usernames.push(username);
            }

            return usernames;
          };

          let stableIterations = 0;
          let usernames = collectUsernames();

          while ((!total || usernames.length < total) && stableIterations < 10) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
            await sleep(650);
            const updated = collectUsernames();
            if (updated.length === usernames.length) {
              stableIterations += 1;
            } else {
              stableIterations = 0;
            }
            usernames = updated;
          }

          await closeActiveDialog();
          await sleep(250);

          return {
            total,
            usernames,
            reachedTotal: !total || usernames.length >= total,
          };
        };

        const followers = await collectList('followers');
        const following = await collectList('following');

        return { followers, following };
      },
    });

    if (!injectionResult) {
      throw new Error('No se pudo leer la respuesta de la pestaña.');
    }

    if (injectionResult.error) {
      throw new Error(injectionResult.error.message || 'Se produjo un error durante la lectura automática.');
    }

    const data = injectionResult.result;

    if (!data || !data.followers || !data.following) {
      throw new Error('Instagram no devolvió información válida.');
    }

    const followersList = data.followers.usernames || [];
    const followingList = data.following.usernames || [];

    followersInput.value = followersList.join('\n');
    followingInput.value = followingList.join('\n');

    const reachedAll = (data.followers.reachedTotal ?? true) && (data.following.reachedTotal ?? true);

    compareButton.disabled = false;
    compareButton.click();

    const summary = `Seguidos leídos: ${followingList.length}${
      data.following.total ? ` / ${data.following.total}` : ''
    } · Seguidores leídos: ${followersList.length}${data.followers.total ? ` / ${data.followers.total}` : ''}`;

    if (reachedAll) {
      setStatus(`Lectura completada. ${summary}`, 'success');
    } else {
      setStatus(`Lectura completada con advertencias. ${summary}`, 'warning');
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Ocurrió un error inesperado durante la lectura automática.', 'error');
  } finally {
    autoFetchButton.disabled = false;
    compareButton.disabled = false;
  }
});
