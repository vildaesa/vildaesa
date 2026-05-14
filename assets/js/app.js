// Konfigurasi Worker AI
const WORKER_URL = 'http://localhost:8787';

// State aplikasi
let chatHistory = [];
let currentSegment = 'grid';
let currentPage = 1;
const perPage = 12;

// DOM Elements
const segmentEl = document.getElementById('main-segment');
const gridView = document.getElementById('grid-view');
const chatView = document.getElementById('chat-view');
const chatModal = document.getElementById('chat-modal');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const infiniteScroll = document.getElementById('infinite-scroll');
const closeModalBtn = document.getElementById('close-modal-btn');
const triggerChatModal = document.getElementById('trigger-chat-modal');
const suggestionsEl = document.getElementById('suggestions');

// ======================= 1. Fetch Data Profil & Repositori =======================
async function fetchProfileData() {
  try {
    const profileRes = await fetch(`${WORKER_URL}/api/profile`);
    if (!profileRes.ok) throw new Error('Profile API error');
    const profileData = (await profileRes.json()).data;

    // Update UI
    document.getElementById('header-username').innerText = profileData.login;
    document.getElementById('user-avatar').src = profileData.avatar_url;
    document.getElementById('user-fullname').innerText = profileData.name || profileData.login;
    document.getElementById('user-bio').innerText = profileData.bio || 'No bio available';
    document.getElementById('user-blog').innerHTML = profileData.blog ? profileData.blog : `github.com/${profileData.login}`;
    document.getElementById('count-repos').innerText = profileData.public_repos;
    document.getElementById('count-followers').innerText = profileData.followers;
    document.getElementById('count-following').innerText = profileData.following;

    // Implementasi tombol Follow & Email
    const btnFollow = document.getElementById('btn-follow');
    const btnEmail = document.getElementById('btn-email');

    if (btnFollow) {
      btnFollow.onclick = () => {
        window.open(profileData.html_url, '_blank');
      };
    }

    if (btnEmail) {
      btnEmail.onclick = () => {
        if (profileData.email) {
          window.location.href = `mailto:${profileData.email}`;
        } else {
          // Fallback menggunakan ion-alert
          showAlert('Informasi', 'Email tidak tersedia secara publik di profil GitHub ini.');
        }
      };
    }
  } catch (err) {
    console.error('Error fetching profile:', err);
  }
}

async function fetchGitHubData(isInitial = false) {
  try {
    if (isInitial) {
      currentPage = 1;
      document.getElementById('repo-container').innerHTML = '';
      infiniteScroll.disabled = false;
      await fetchProfileData();
    }

    // Ambil daftar repositori (paginated)
    const reposRes = await fetch(`${WORKER_URL}/api/repos?per_page=${perPage}&page=${currentPage}&sort=updated`);
    if (!reposRes.ok) throw new Error('Repos API error');
    
    const responseData = await reposRes.json();
    const reposData = responseData.data;

    // Tampilkan di grid
    const repoContainer = document.getElementById('repo-container');
    
    if (isInitial && reposData.length === 0) {
      repoContainer.innerHTML = '<ion-col size="12" style="text-align:center; padding:20px;">No public repositories</ion-col>';
    } else {
      reposData.forEach(repo => {
        const col = document.createElement('ion-col');
        col.setAttribute('size', '4');
        col.style.padding = '1px';
        col.innerHTML = `
          <div class="repo-card" onclick="window.open('${repo.html_url}', '_blank')" style="cursor: pointer;">
            <div class="repo-title">${escapeHtml(repo.name)}</div>
            <div class="repo-desc">${escapeHtml(repo.description) || 'No description'}</div>
            <div class="repo-stats">
              <span>⭐ ${repo.stargazers_count}</span>
              <span>🍴 ${repo.forks_count}</span>
            </div>
          </div>
        `;
        repoContainer.appendChild(col);
      });
    }

    // Cek apakah ada halaman berikutnya
    if (reposData.length < perPage) {
      infiniteScroll.disabled = true;
    }

    currentPage++;
  } catch (err) {
    console.error('Error fetching GitHub data:', err);
    if (isInitial) {
      document.getElementById('user-bio').innerText = 'Gagal memuat data GitHub.';
    }
  } finally {
    if (infiniteScroll) {
      infiniteScroll.complete();
    }
  }
}

// ======================= 2. AI Chat Logic =======================
async function sendMessageToAI(userMessage) {
  if (!userMessage.trim()) return;

  // Tampilkan pesan user di chat
  appendMessage(userMessage, 'user');
  chatInput.value = '';
  // Nonaktifkan sementara tombol
  sendBtn.disabled = true;

  // Tampilkan typing indicator
  showTypingIndicator();

  try {
    const response = await fetch(`${WORKER_URL}/api/ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userMessage,
        chatHistory: chatHistory
      })
    });

    // Sembunyikan typing indicator
    hideTypingIndicator();

    if (!response.ok) throw new Error(`AI API error: ${response.status}`);
    const data = await response.json();
    const aiResponse = data.response;
    const mentionedRepos = data.mentioned_repos || [];

    // Tambahkan ke history
    chatHistory.push({ role: "user", content: userMessage });
    chatHistory.push({ role: "assistant", content: aiResponse });

    // Tampilkan balasan AI dengan Markdown
    appendMessage(aiResponse, 'ai', false, true);

    // Jika ada repositori yang disebut, tampilkan sebagai kartu kecil
    if (mentionedRepos.length > 0) {
      const repoHtml = mentionedRepos.map(repo => `
        <div class="mentioned-repo" onclick="window.open('${repo.html_url}', '_blank')" style="cursor:pointer;">
          <strong>📁 ${escapeHtml(repo.name)}</strong><br>
          ${escapeHtml(repo.description) || ''}<br>
          ⭐ ${repo.stargazers_count} | 🍴 ${repo.forks_count}
        </div>
      `).join('');
      appendMessage(repoHtml, 'ai', true);
    }
  } catch (err) {
    hideTypingIndicator();
    console.error('Chat error:', err);
    appendMessage('Maaf, terjadi kesalahan. Coba lagi nanti.', 'ai');
  } finally {
    sendBtn.disabled = false;
    scrollToBottom();
  }
}

function appendMessage(content, sender, isHtml = false, isMarkdown = false) {
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('chat-message');
  msgDiv.classList.add(sender === 'user' ? 'user-message' : 'ai-message');
  
  if (isMarkdown && typeof marked !== 'undefined') {
    msgDiv.innerHTML = marked.parse(content);
  } else if (isHtml) {
    msgDiv.innerHTML = content;
  } else {
    msgDiv.textContent = content;
  }
  
  chatMessages.appendChild(msgDiv);
  scrollToBottom();
}

function showTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'typing-indicator';
  indicator.className = 'typing-indicator';
  indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  chatMessages.appendChild(indicator);
  scrollToBottom();
}

function hideTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) indicator.remove();
}

function scrollToBottom() {
  setTimeout(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 100);
}

// ======================= 3. Segment Toggle =======================
function toggleSegment(value) {
  currentSegment = value;
  if (value === 'grid') {
    gridView.style.display = 'block';
    chatView.style.display = 'none';
  } else {
    gridView.style.display = 'none';
    chatView.style.display = 'block';
  }
}

// ======================= 4. Event Listeners =======================
segmentEl.addEventListener('ionChange', (e) => {
  toggleSegment(e.detail.value);
});

// Modal trigger
if (triggerChatModal) {
  triggerChatModal.addEventListener('click', () => {
    chatModal.present();
  });
}

// Close modal
if (closeModalBtn) {
  closeModalBtn.addEventListener('click', () => {
    chatModal.dismiss();
  });
}

sendBtn.addEventListener('click', () => {
  sendMessageToAI(chatInput.value);
});
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessageToAI(chatInput.value);
});

// Suggestion chips
if (suggestionsEl) {
  suggestionsEl.addEventListener('click', (e) => {
    if (e.target.classList.contains('suggestion-chip')) {
      const suggestionText = e.target.innerText;
      chatInput.value = suggestionText;
      chatModal.present();
      sendMessageToAI(suggestionText);
    }
  });
}

// Infinite Scroll event
infiniteScroll.addEventListener('ionInfinite', (event) => {
  fetchGitHubData();
});

// Helper
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// Mulai
window.addEventListener('load', () => {
  fetchGitHubData(true);
  toggleSegment('grid'); // default tampilkan grid
});

// Global Alert Utility using Ion Alert
async function showAlert(header, message) {
  const alert = document.createElement('ion-alert');
  alert.header = header;
  alert.message = message;
  alert.buttons = ['OK'];

  document.body.appendChild(alert);
  return alert.present();
}
