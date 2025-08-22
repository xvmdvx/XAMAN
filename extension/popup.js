document.getElementById('checkBtn').addEventListener('click', () => {
  const name = document.getElementById('companyName').value.trim();
  if (!name) {
    alert('Por favor ingrese un nombre.');
    return;
  }
  const url = 'https://ecorp.sos.ga.gov/BusinessSearch?SearchTerm=' + encodeURIComponent(name);
  chrome.tabs.create({ url });
});
