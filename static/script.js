// 创建toast容器
let toastContainer = null;

// 显示提示消息
function showToast(message, type = 'info') {
    // 创建toast容器（如果不存在）
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(toastContainer);
    }

    // 创建toast元素
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // 添加样式
    toast.style.cssText = `
        padding: 12px 20px;
        border-radius: 4px;
        color: white;
        font-weight: bold;
        transition: all 0.3s ease;
        opacity: 0;
        transform: translateX(100%);
    `;
    
    // 根据类型设置颜色
    switch(type) {
        case 'success':
            toast.style.backgroundColor = '#4CAF50';
            break;
        case 'error':
            toast.style.backgroundColor = '#f44336';
            break;
        case 'warning':
            toast.style.backgroundColor = '#ff9800';
            break;
        default:
            toast.style.backgroundColor = '#2196F3';
    }
    
    toastContainer.appendChild(toast);
    
    // 触发动画显示
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    }, 10);
    
    // 3秒后自动移除
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
                // 如果容器为空，移除容器
                if (toastContainer.children.length === 0) {
                    document.body.removeChild(toastContainer);
                    toastContainer = null;
                }
            }
        }, 300);
    }, 3000);
}


// API请求封装
async function apiRequest(url, method = 'GET', data = null, showError = true) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'same-origin'
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        if (showError) {
            showToast(`请求失败: ${error.message}`, 'error');
            console.error('API请求错误:', error);
            // const errorData = await response.json().catch(() => null);
            // const errorMessage = errorData?.error || `游戏服务器连接失败 (${response.status})，请刷新页面重试`;
            // showToast(errorMessage, 'error');
        }
        return null;
    }
}


// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', function() {
    // 页面加载时获取用户信息
    // fetchUserInfo();
    
});


