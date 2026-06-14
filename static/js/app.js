const { apiGet, apiPost } = SongloftPlugin;

// DOM elements
const elUrl = document.getElementById('lxserverUrl');
const elToken = document.getElementById('lxserverToken');
const elUsername = document.getElementById('lxserverUsername');
const elQuality = document.getElementById('defaultQuality');
const elPlatform = document.getElementById('defaultPlatform');
const elStatusDot = document.getElementById('statusDot');
const elStatusText = document.getElementById('statusText');
const elBtnSave = document.getElementById('btnSave');
const elBtnRefresh = document.getElementById('btnRefresh');

// Load config from backend
async function loadConfig() {
    try {
        const resp = await apiGet('/api/config');
        const config = resp.data || resp;
        elUrl.value = config.lxserverUrl || '';
        // Token comes back masked as '***', clear it so user doesn't accidentally save it
        elToken.value = '';
        elToken.placeholder = config.lxserverToken ? '已配置（留空保持不变）' : '可选';
        elUsername.value = config.lxserverUsername || '';
        elQuality.value = config.defaultQuality || '320k';
        elPlatform.value = config.defaultPlatform || 'all';
    } catch (e) {
        showSnackbar('加载配置失败');
        console.error('loadConfig error:', e);
    }
}

// Check lxserver connectivity
async function checkHealth() {
    elStatusDot.className = 'status-dot';
    elStatusText.textContent = '检查中...';
    elBtnRefresh.disabled = true;

    try {
        const resp = await apiGet('/api/health');
        const data = resp.data || resp;
        if (data.connected) {
            elStatusDot.className = 'status-dot connected';
            elStatusText.textContent = '已连接';
        } else {
            elStatusDot.className = 'status-dot disconnected';
            elStatusText.textContent = data.error ? `连接失败：${data.error}` : '无法连接';
        }
    } catch (e) {
        elStatusDot.className = 'status-dot disconnected';
        elStatusText.textContent = '检查失败';
    }

    elBtnRefresh.disabled = false;
}

// Save config to backend
async function saveConfig() {
    elBtnSave.disabled = true;

    const body = {
        lxserverUrl: elUrl.value.trim(),
        lxserverUsername: elUsername.value.trim(),
        defaultQuality: elQuality.value,
        defaultPlatform: elPlatform.value,
    };

    // Only send token if user entered a new one
    const token = elToken.value.trim();
    if (token) {
        body.lxserverToken = token;
    }

    try {
        await apiPost('/api/config', body);
        showSnackbar('配置已保存');
        // Refresh health after config change
        setTimeout(checkHealth, 500);
    } catch (e) {
        showSnackbar('保存失败');
        console.error('saveConfig error:', e);
    }

    elBtnSave.disabled = false;
}

// Snackbar notification
function showSnackbar(message) {
    const snackbar = document.getElementById('snackbar');
    snackbar.textContent = message;
    snackbar.classList.add('show');
    setTimeout(() => snackbar.classList.remove('show'), 3000);
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    elBtnSave.onclick = saveConfig;
    elBtnRefresh.onclick = checkHealth;
    loadConfig();
    checkHealth();
});
