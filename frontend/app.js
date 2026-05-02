// --- SECURE ENTERPRISE CONFIGURATION ---
const BACKEND_URL = "https://national-registry-api.onrender.com";

let currentRoom = "";
let currentRole = ""; 
let expectedCaptchaAnswer = 0;
let isOtpStep = false; 

// --- SECURE CHAT LOGIC (WEBSOCKETS) ---
let ws = null; 

window.addEventListener('DOMContentLoaded', (event) => {
    generateCaptcha(); 
    
    // --- MAGIC LINK INTERCEPTOR ---
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    const tokenParam = urlParams.get('token');
    
    if (roomParam && tokenParam) {
        verifyMagicLink(roomParam, tokenParam);
    }
});

function generateCaptcha() {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    expectedCaptchaAnswer = num1 + num2;
    const captchaElement = document.getElementById("captcha-question");
    if(captchaElement) captchaElement.innerText = `Security Check: What is ${num1} + ${num2}?`;
}

// --- DASHBOARD NAVIGATION LOGIC ---
function hideAllSections() {
    const sections = [
        "dashboard-nav", "how-it-works", "lost-section", 
        "found-section", "resume-section", "police-section", "chat-portal"
    ];
    
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = ""; // Clear any old inline styles
            el.classList.add("hidden"); // Use the Tailwind class
        }
    });
}

function showDashboard() {
    // Gracefully close WebSocket if returning to dashboard
    if (ws) {
        ws.close();
        ws = null;
    }
    
    hideAllSections();
    document.getElementById("how-it-works").classList.remove("hidden");
    document.getElementById("dashboard-nav").classList.remove("hidden");
    document.getElementById("dashboard-nav").style.display = "grid"; 
}

document.getElementById("btn-show-lost").addEventListener("click", () => { hideAllSections(); document.getElementById("lost-section").classList.remove("hidden"); });
document.getElementById("btn-show-found").addEventListener("click", () => { hideAllSections(); document.getElementById("found-section").classList.remove("hidden"); });
document.getElementById("btn-show-resume").addEventListener("click", () => { hideAllSections(); document.getElementById("resume-section").classList.remove("hidden"); });
document.getElementById("btn-show-police").addEventListener("click", () => { hideAllSections(); document.getElementById("police-section").classList.remove("hidden"); });

function showModal(title, message, type, roomId = null, role = null) {
    const modal = document.getElementById("custom-modal");
    const modalBox = document.getElementById("modal-box");
    const actionBtn = document.getElementById("modal-action-btn");
    
    modalBox.className = "bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center transform transition-all scale-100 border-t-4 border-amber-500"; 
    
    if (type === "match") {
        actionBtn.innerText = "Initiate Secure Claim";
        actionBtn.className = "w-full bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white font-bold tracking-wide uppercase py-3.5 rounded-xl transition-all shadow-md"; 
        actionBtn.onclick = function() { closeModal(); openSecureChat(roomId, role); };
    } else {
        actionBtn.innerText = "Acknowledge";
        actionBtn.className = "w-full bg-slate-900 hover:bg-black active:scale-[0.98] text-amber-500 font-bold tracking-wide uppercase py-3.5 rounded-xl transition-all shadow-md";
        actionBtn.onclick = closeModal;
    }
    document.getElementById("modal-title").innerText = title;
    document.getElementById("modal-message").innerHTML = message;
    
    modal.style.display = ""; 
    modal.classList.remove("hidden");
    modal.style.display = "flex"; 
}

function closeModal() { 
    const modal = document.getElementById("custom-modal");
    if (modal) {
        modal.style.display = ""; 
        modal.classList.add("hidden"); 
    }
}

// --- MAGIC LINK AUTHENTICATION ---
async function verifyMagicLink(room, token) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/auth/verify-magic-link`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ room_id: room, token: token })
        });
        const data = await response.json();
        
        if (response.ok) {
            openSecureChat(room, data.role);
        } else {
            showModal("Link Expired", "This secure link is invalid or has expired. Please use the Resume Claim portal to request a new OTP code.", "error");
        }
    } catch (e) {
        showModal("Connection Error", "Could not verify the secure link with the server.", "error");
    }
}

// --- SECURE WEBSOCKET CHAT ENGINE ---
function openSecureChat(roomId, role) {
    currentRoom = roomId;
    currentRole = role;

    hideAllSections(); 
    const chatPortal = document.getElementById("chat-portal");
    chatPortal.classList.remove("hidden");
    chatPortal.style.display = "block";

    const chatBox = document.getElementById("chat-box");
    chatBox.innerHTML = '<div class="text-center text-slate-400 text-xs font-medium my-2 uppercase tracking-widest">Match Confirmed. You are connected as the ' + currentRole + '.</div>';

    fetchHistoricalMessages(); 

    // Convert https:// to wss:// for secure web sockets
    const wsUrl = BACKEND_URL.replace(/^http/, 'ws') + `/ws/chat/${currentRoom}/${currentRole}`;
    ws = new WebSocket(wsUrl);

    ws.onmessage = function(event) {
        const msg = JSON.parse(event.data);
        appendMessageToUI(msg.sender, msg.message);
        
        if (msg.sender !== currentRole) {
            fetch(`${BACKEND_URL}/api/chat/read`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ room_id: currentRoom, role: currentRole })
            });
        }
    };

    ws.onclose = function() {
        console.log("Secure connection closed.");
    };
}

async function fetchHistoricalMessages() {
    if (!currentRoom) return;
    try {
        const response = await fetch(`${BACKEND_URL}/api/chat/${currentRoom}`);
        const result = await response.json();
        
        if (result.data) {
            result.data.forEach(msg => appendMessageToUI(msg.sender, msg.message));
        }

        await fetch(`${BACKEND_URL}/api/chat/read`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ room_id: currentRoom, role: currentRole })
        });

    } catch (error) { console.error("Chat sync error", error); }
}

function appendMessageToUI(sender, messageText) {
    const chatBox = document.getElementById("chat-box");
    const bubble = document.createElement("div");
    
    if (sender === currentRole) {
        bubble.className = "self-end bg-blue-600 text-white py-2 px-4 rounded-bl-xl rounded-tl-xl rounded-tr-xl max-w-[80%] text-sm shadow-sm mt-2";
    } else {
        bubble.className = "self-start bg-slate-200 text-slate-800 py-2 px-4 rounded-br-xl rounded-tr-xl rounded-tl-xl max-w-[80%] text-sm shadow-sm mt-2";
    }
    
    bubble.innerText = sender + ": " + messageText;
    chatBox.appendChild(bubble);
    chatBox.scrollTop = chatBox.scrollHeight; 
}

// --- CHAT FORM SUBMISSION (VIA WEBSOCKET) ---
document.getElementById("chat-form").addEventListener("submit", function(event) {
    event.preventDefault();
    const input = document.getElementById("chat-input");
    const messageText = input.value.trim();
    
    if (messageText !== "" && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(messageText);
        input.value = ""; 
    }
});

// --- DYNAMIC OTP RESUME CLAIM FLOW ---
document.getElementById("resume-claim-form").addEventListener("submit", async function(event) {
    event.preventDefault();
    const room = document.getElementById("resume-room").value.trim();
    const email = document.getElementById("resume-email").value.trim();
    const submitBtn = event.target.querySelector('button');

    if (!isOtpStep) {
        submitBtn.innerHTML = 'Sending Code... <i data-lucide="loader" class="w-4 h-4 animate-spin"></i>';
        lucide.createIcons();
        
        try {
            const response = await fetch(`${BACKEND_URL}/api/auth/request-otp`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ room_id: room, email: email })
            });
            const data = await response.json();
            
            if (response.ok) {
                isOtpStep = true;
                document.getElementById("resume-email").parentElement.style.display = 'none'; 
                document.getElementById("resume-room").parentElement.style.display = 'none'; 
                
                const otpDiv = document.createElement('div');
                otpDiv.id = 'otp-container';
                otpDiv.innerHTML = `
                    <label class="block text-sm font-medium text-slate-700 mb-1.5">Enter 6-Digit Code sent to ${email}</label>
                    <input type="text" id="resume-otp" placeholder="e.g. 123456" required maxlength="6" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-center tracking-[0.5em] font-bold text-2xl text-slate-800">
                `;
                this.insertBefore(otpDiv, submitBtn);
                
                submitBtn.innerHTML = 'Verify Code & Enter Chat <i data-lucide="arrow-right" class="w-4 h-4"></i>';
                lucide.createIcons();
                showModal("Secure Code Sent", `Please check your inbox. The code expires in 5 minutes.`, "success");
            } else {
                showModal("Access Denied", data.detail || "Email does not match the registry records for this System ID.", "error");
                submitBtn.innerHTML = 'Request Secure Access Code <i data-lucide="mail-check" class="w-4 h-4"></i>';
                lucide.createIcons();
            }
        } catch(e) {
            showModal("Connection Error", "Could not reach the authentication server.", "error");
            submitBtn.innerHTML = 'Request Secure Access Code <i data-lucide="mail-check" class="w-4 h-4"></i>';
            lucide.createIcons();
        }
    } else {
        const otp = document.getElementById("resume-otp").value.trim();
        submitBtn.innerHTML = 'Verifying... <i data-lucide="loader" class="w-4 h-4 animate-spin"></i>';
        lucide.createIcons();

        try {
            const response = await fetch(`${BACKEND_URL}/api/auth/verify-otp`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ room_id: room, email: email, otp: otp })
            });
            const data = await response.json();
            
            if (response.ok) {
                isOtpStep = false;
                document.getElementById("otp-container").remove();
                document.getElementById("resume-email").parentElement.style.display = 'block';
                document.getElementById("resume-room").parentElement.style.display = 'block';
                submitBtn.innerHTML = 'Request Secure Access Code <i data-lucide="mail-check" class="w-4 h-4"></i>';
                lucide.createIcons();
                this.reset();
                
                openSecureChat(room, data.role); 
            } else {
                showModal("Verification Failed", data.detail || "Invalid or expired code.", "error");
                submitBtn.innerHTML = 'Verify Code & Enter Chat <i data-lucide="arrow-right" class="w-4 h-4"></i>';
                lucide.createIcons();
            }
        } catch(e) {
            showModal("Connection Error", "Could not reach the authentication server.", "error");
            submitBtn.innerHTML = 'Verify Code & Enter Chat <i data-lucide="arrow-right" class="w-4 h-4"></i>';
            lucide.createIcons();
        }
    }
});

// --- 7-DAY POLICE DROPOFF LOGIC ---
document.getElementById("police-dropoff-form").addEventListener("submit", async function(event) {
    event.preventDefault();
    const payload = {
        unique_identifier: document.getElementById("police-item-id").value.trim(),
        police_station: document.getElementById("police-station-name").value.trim()
    };

    try {
        const response = await fetch(`${BACKEND_URL}/api/found-items/police`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        if (response.ok) {
            showModal("Handover Complete", result.message, "success");
            document.getElementById("police-dropoff-form").reset();
        }
    } catch (error) { showModal("Error", "Could not log handover.", "error"); }
});

// --- LOST ITEM FORM ---
document.getElementById("lost-item-form").addEventListener("submit", async function(event) {
    event.preventDefault(); 
    const userAnswer = parseInt(document.getElementById("captcha-answer").value);
    if (userAnswer !== expectedCaptchaAnswer) {
        showModal("Security Failed", "Incorrect math answer.", "error");
        generateCaptcha(); return; 
    }

    const submitBtn = event.target.querySelector('button');
    submitBtn.innerText = "Processing...";

    const newItem = {
        owner_email: document.getElementById("owner-email").value,
        category: document.getElementById("category").value,
        color: document.getElementById("color").value,
        description: document.getElementById("description").value,
        unique_identifier: document.getElementById("unique_identifier").value
    };

    try {
        const response = await fetch(`${BACKEND_URL}/api/lost-items`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newItem)
        });
        const result = await response.json();

        if (response.ok) {
            if (result.status === "AT_POLICE") {
                showModal("🚨 ITEM AT POLICE STATION", result.message, "success"); 
            } else if (result.status === "MATCH_FOUND") {
                showModal("🚨 URGENT MATCH!", result.message, "match", result.room_id, "Owner");
            } else {
                showModal("Item Registered", result.message, "success");
            }
            document.getElementById("lost-item-form").reset(); 
            generateCaptcha(); 
        } 
    } catch (error) { showModal("Connection Failed", "System is offline.", "error"); } 
    finally { submitBtn.innerText = "Submit Trace Request"; }
});

// --- FOUND ITEM FORM ---
document.getElementById("found-item-form").addEventListener("submit", async function(event) {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button');
    submitBtn.innerText = "Processing...";

    const newItem = {
        finder_email: document.getElementById("finder-email").value,
        category: document.getElementById("found-category").value,
        color: document.getElementById("found-color").value,
        description: document.getElementById("found-description").value,
        withheld_feature: document.getElementById("withheld_feature").value,
        unique_identifier: document.getElementById("found-unique_identifier").value || null
    };

    try {
        const response = await fetch(`${BACKEND_URL}/api/found-items`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newItem)
        });
        const result = await response.json(); 

        if (response.ok) {
            if (result.status === "MATCH_FOUND") showModal("🚨 URGENT MATCH!", result.message, "match", result.room_id, "Finder");
            else showModal("Item Secured", result.message, "success");
            document.getElementById("found-item-form").reset();
        } 
    } catch (error) { showModal("Connection Failed", "System is offline.", "error"); } 
    finally { submitBtn.innerText = "Secure Property Record"; }
});

// --- CLAIM RESOLUTION (BURN PROTOCOL) ---
async function endChatAndBurnBridge(reason) {
    const isConfirmed = confirm(`Are you sure you want to resolve this? This will permanently delete the chat history and finalize the ${reason}.`);
    
    if (isConfirmed) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/chat/${currentRoom}`, {
                method: "DELETE"
            });

            if (response.ok) {
                if (ws) {
                    ws.close();
                    ws = null;
                }
                alert(`Success: Chat securely erased. The connection has been destroyed.`);
                window.location.reload(); 
            } else {
                alert("Error: Could not delete chat data. Please try again.");
            }
        } catch (error) {
            console.error("Failed to delete chat:", error);
            alert("Network error: Could not reach the server.");
        }
    }
}

document.getElementById("resolve-btn").addEventListener("click", () => {
    endChatAndBurnBridge("successful claim");
});

document.getElementById("reject-btn").addEventListener("click", () => {
    endChatAndBurnBridge("false match");
});