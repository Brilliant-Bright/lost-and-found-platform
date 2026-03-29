const BACKEND_URL = "http://https://national-registry-api.onrender.com:8000";

let currentRoom = "";
let currentRole = ""; 
let chatInterval = null;
let expectedCaptchaAnswer = 0;

window.addEventListener('DOMContentLoaded', (event) => {
    generateCaptcha(); 
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    const roleParam = urlParams.get('role');
    
    if (roomParam && roleParam) {
        openSecureChat(roomParam, roleParam);
    }
});

function generateCaptcha() {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    expectedCaptchaAnswer = num1 + num2;
    document.getElementById("captcha-question").innerText = `Security Check: What is ${num1} + ${num2}?`;
}

function showModal(title, message, type, roomId = null, role = null) {
    const modal = document.getElementById("custom-modal");
    const modalBox = document.getElementById("modal-box");
    const actionBtn = document.getElementById("modal-action-btn");
    
    modalBox.className = "modal-content"; 
    
    if (type === "match") {
        modalBox.classList.add("modal-match");
        actionBtn.innerText = "Initiate Secure Claim";
        actionBtn.style.backgroundColor = "#e53e3e"; 
        actionBtn.onclick = function() { closeModal(); openSecureChat(roomId, role); };
    } else {
        if (type === "success") modalBox.classList.add("modal-success");
        else if (type === "error") modalBox.classList.add("modal-error");
        
        actionBtn.innerText = "Acknowledge";
        actionBtn.style.backgroundColor = "#4a5568";
        actionBtn.onclick = closeModal;
    }
    document.getElementById("modal-title").innerText = title;
    document.getElementById("modal-message").innerHTML = message;
    modal.style.display = "flex"; 
}

function closeModal() { document.getElementById("custom-modal").style.display = "none"; }

function openSecureChat(roomId, role) {
    currentRoom = roomId;
    currentRole = role;

    document.getElementById("lost-section").style.display = "none";
    document.getElementById("found-section").style.display = "none";
    document.getElementById("divider").style.display = "none";
    document.getElementById("resume-claim-form").parentElement.style.display = "none";
    document.getElementById("chat-portal").style.display = "block";

    fetchMessages(); 
    chatInterval = setInterval(fetchMessages, 2000); 
}

async function fetchMessages() {
    if (!currentRoom) return;
    try {
        const response = await fetch(`${BACKEND_URL}/api/chat/${currentRoom}`);
        const result = await response.json();
        const chatBox = document.getElementById("chat-box");
        
        chatBox.innerHTML = '<div class="message-bubble msg-system">Match Confirmed. Chat session started. You are the ' + currentRole + '.</div>';
        
        result.data.forEach(msg => {
            const bubble = document.createElement("div");
            bubble.className = msg.sender === currentRole ? "message-bubble msg-you" : "message-bubble msg-them";
            bubble.innerText = msg.sender + ": " + msg.message;
            chatBox.appendChild(bubble);
        });
        chatBox.scrollTop = chatBox.scrollHeight; 

        await fetch(`${BACKEND_URL}/api/chat/read`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ room_id: currentRoom, role: currentRole })
        });

    } catch (error) { console.error("Chat sync error", error); }
}

document.getElementById("resume-claim-form").addEventListener("submit", function(event) {
    event.preventDefault();
    const room = document.getElementById("resume-room").value.trim();
    const role = document.getElementById("resume-role").value;
    
    if (room && role) {
        openSecureChat(room, role);
    }
});

document.getElementById("chat-form").addEventListener("submit", async function(event) {
    event.preventDefault();
    const input = document.getElementById("chat-input");
    const chatBox = document.getElementById("chat-box");
    const messageText = input.value.trim();
    
    if (messageText !== "") {
        const bubble = document.createElement("div");
        bubble.className = "message-bubble msg-you";
        bubble.innerText = currentRole + ": " + messageText;
        chatBox.appendChild(bubble);
        chatBox.scrollTop = chatBox.scrollHeight;

        input.value = ""; 

        const payload = { room_id: currentRoom, sender: currentRole, message: messageText };
        try {
            await fetch(`${BACKEND_URL}/api/chat`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
            });
        } catch (error) {}
    }
});

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
            if (result.status === "MATCH_FOUND") showModal("🚨 URGENT MATCH!", result.message, "match", result.room_id, "Owner");
            else showModal("Item Registered", result.message, "success");
            document.getElementById("lost-item-form").reset(); 
            generateCaptcha(); 
        } 
    } catch (error) { showModal("Connection Failed", "System is offline.", "error"); } 
    finally { submitBtn.innerText = "Submit Lost Report"; }
});

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
    finally { submitBtn.innerText = "Secure Found Item"; }
});

document.getElementById("resolve-btn").addEventListener("click", async function() {
    const confirmResolution = confirm("Are you sure you want to resolve this claim? This will permanently delete the chat history to protect your privacy.");
    
    if (confirmResolution) {
        try {
            await fetch(`${BACKEND_URL}/api/chat/${currentRoom}`, {
                method: 'DELETE'
            });
            
            clearInterval(chatInterval); 
            
            alert("Claim successfully resolved! The secure chat has been permanently erased.");
            window.location.href = "index.html"; 
            
        } catch (error) {
            console.error("Failed to resolve claim.");
        }
    }
});