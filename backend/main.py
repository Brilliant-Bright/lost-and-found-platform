import os
import re
import uuid
import asyncio
import requests  
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="National Lost and Found API - Armored")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],  
    allow_headers=["*"],
)

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

FRONTEND_URL = "https://lost-and-found-platform-sage.vercel.app"

# --- HTTP EMAIL DISPATCHER (BREVO FIREWALL BYPASS) ---
def dispatch_email(to_address: str, subject: str, body: str):
    # Pulls the new key from Render's secure vault
    brevo_api_key = os.environ.get("BREVO_API_KEY")
    
    url = "https://api.brevo.com/v3/smtp/email"
    
    headers = {
        "accept": "application/json",
        "api-key": brevo_api_key,
        "content-type": "application/json"
    }
    
    html_body = f"""
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">National Registry Alert</h2>
        <p style="font-size: 16px; line-height: 1.5; color: #333;">{body.replace(chr(10), '<br>')}</p>
        <p style="font-size: 12px; color: #888; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
            This is an automated alert from the National Registry system.
        </p>
    </div>
    """
    
    payload = {
        "sender": {"name": "National Registry", "email": "iambrightbb3@gmail.com"},
        "to": [{"email": to_address}],
        "subject": subject,
        "htmlContent": html_body
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        response.raise_for_status() 
        print(f"BREVO DISPATCH SUCCESS: HTTP Email routed to {to_address}")
    except Exception as e:
        print("\n" + "="*50)
        print(f"BREVO FAILED: {e}")
        print(f"Response data: {response.text if 'response' in locals() else 'No response'}")
        print("="*50 + "\n")

# --- SYMMETRICAL ASYNC CRON JOB ---
async def cron_monitor_unread_messages():
    print("Cron Job Initialized: Monitoring for unread messages on BOTH sides...")
    while True:
        await asyncio.sleep(60) 
        try:
            ten_mins_ago = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
            
            unread_query = supabase.table("secure_messages").select("*").eq("is_read", False).eq("fallback_sent", False).lt("created_at", ten_mins_ago).execute()
            
            for msg in unread_query.data:
                room_id = msg['room_id']
                sender = msg['sender']
                
                target_email = None
                subject = "URGENT: New Message in Secure Claim Portal"
                magic_link = ""

                if sender == "Finder":
                    lost_item = supabase.table("items_lost").select("owner_email").eq("unique_identifier", room_id).execute()
                    if len(lost_item.data) > 0 and lost_item.data[0]['owner_email']:
                        target_email = lost_item.data[0]['owner_email']
                        magic_link = f"{FRONTEND_URL}/index.html?room={room_id}&role=Owner"
                
                elif sender == "Owner":
                    found_item = supabase.table("items_found").select("finder_email").eq("unique_identifier", room_id).execute()
                    if len(found_item.data) > 0 and found_item.data[0]['finder_email']:
                        target_email = found_item.data[0]['finder_email']
                        magic_link = f"{FRONTEND_URL}/index.html?room={room_id}&role=Finder"

                if target_email:
                    body = f"You have an unread message regarding the item.\n\nLog in securely here to reply: {magic_link}"
                    dispatch_email(target_email, subject, body)
                    
                    supabase.table("secure_messages").update({"fallback_sent": True}).eq("id", msg['id']).execute()
                    print(f"CRON EXECUTED: Fallback sent to {sender}'s counterpart for Room {room_id}")

        except Exception as e:
            print(f"Cron Error: {e}")

# --- LEGAL COMPLIANCE: 6-MONTH DATA RETENTION PURGE ---
async def cron_data_retention_purge():
    print("Cron Job Initialized: 6-Month Data Retention Purge...")
    while True:
        # Run this check once every 24 hours (86400 seconds)
        await asyncio.sleep(86400)
        try:
            six_months_ago = (datetime.now(timezone.utc) - timedelta(days=180)).isoformat()
            
            supabase.table("items_lost").delete().lt("created_at", six_months_ago).execute()
            supabase.table("items_found").delete().lt("created_at", six_months_ago).execute()
            supabase.table("secure_messages").delete().lt("created_at", six_months_ago).execute()
            
            print(f"CRON EXECUTED: Purged all records older than {six_months_ago} to comply with Data Protection Act.")

        except Exception as e:
            print(f"Retention Purge Error: {e}")

# --- 7-DAY ESCALATION PROTOCOL ---
async def cron_police_handover_reminder():
    print("Cron Job Initialized: 7-Day Police Handover Monitor...")
    while True:
        await asyncio.sleep(43200) # Runs every 12 hours
        try:
            seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            
            stale_items = supabase.table("items_found").select("*").is_("police_station", "null").lt("created_at", seven_days_ago).execute()
            
            for item in stale_items.data:
                finder_email = item['finder_email']
                item_id = item['unique_identifier']
                
                subject = "Action Required: Surrender Item to Authorities"
                body = f"You have held the found item for 7 days. To avoid liability, please surrender it to your nearest Police Station.\n\nOnce dropped off, log the station name securely here: {FRONTEND_URL}/index.html"
                
                dispatch_email(finder_email, subject, body)
                print(f"CRON EXECUTED: Police handover reminder sent to {finder_email}")

        except Exception as e:
            print(f"Handover Cron Error: {e}")

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(cron_monitor_unread_messages())
    asyncio.create_task(cron_data_retention_purge()) 
    asyncio.create_task(cron_police_handover_reminder())

# --- ARMORED DATA MODELS ---
class LostItem(BaseModel):
    category: str = Field(..., max_length=50)
    color: Optional[str] = Field(None, max_length=30)
    description: str = Field(..., max_length=500)
    unique_identifier: Optional[str] = Field(None, max_length=100)
    owner_email: str = Field(..., max_length=100)

class FoundItem(BaseModel):
    finder_email: str = Field(..., max_length=100)
    category: str = Field(..., max_length=50)
    color: Optional[str] = Field(None, max_length=30)
    description: str = Field(..., max_length=500)
    withheld_feature: str = Field(..., max_length=150)
    unique_identifier: Optional[str] = Field(None, max_length=100)

class ChatMessage(BaseModel):
    room_id: str = Field(..., max_length=100)
    sender: str = Field(..., max_length=20)
    message: str = Field(..., max_length=1000)

class ReadReceipt(BaseModel):
    room_id: str
    role: str

class PoliceDropoff(BaseModel):
    unique_identifier: str = Field(..., max_length=100)
    police_station: str = Field(..., max_length=150)

# --- THE SMART ENGINE ---
def find_best_match(target_item, table_to_search):
    serial = target_item.unique_identifier.strip().upper() if target_item.unique_identifier else ""
    
    if serial and not serial.startswith("SECURE-UUID-"):
        exact_query = supabase.table(table_to_search).select("*").eq("unique_identifier", serial).execute()
        if len(exact_query.data) > 0: return exact_query.data[0] 

    fuzzy_query = supabase.table(table_to_search).select("*").ilike("category", f"%{target_item.category}%").execute()
    best_score = 0
    best_match_data = None
    
    target_words = set(re.findall(r'\b\w+\b', target_item.description.lower()))
    boring_words = {"the", "and", "a", "is", "in", "it", "of", "to", "was", "found", "lost", "with", "my", "i"}
    target_keywords = target_words - boring_words

    for potential_match in fuzzy_query.data:
        score = 0
        if target_item.color and potential_match.get("color"):
            if target_item.color.lower().strip() == potential_match["color"].lower().strip(): score += 2 
        
        potential_desc = potential_match.get("description", "")
        potential_words = set(re.findall(r'\b\w+\b', potential_desc.lower()))
        score += len(target_keywords.intersection(potential_words))

        if score >= 2 and score > best_score:
            best_score = score
            best_match_data = potential_match
            
    if best_score >= 2: return best_match_data
    return None

# --- API ROUTES ---
@app.post("/api/lost-items")
def report_lost_item(item: LostItem):
    clean_serial = item.unique_identifier.strip() if item.unique_identifier else f"SECURE-UUID-{str(uuid.uuid4())}"
    
    supabase.table("items_lost").insert({
        "category": item.category, "color": item.color, "description": item.description,
        "unique_identifier": clean_serial, "owner_email": item.owner_email
    }).execute()

    matched_item = find_best_match(item, "items_found")
    
    # --- NEW: ANTI-LOOP CHECK ---
    if matched_item and matched_item.get("finder_email") == item.owner_email:
        matched_item = None # Cancel the match if testing with the same email

    if matched_item:
        # CHECK IF IT IS AT THE POLICE FIRST
        if matched_item.get("police_station"):
            station_name = matched_item["police_station"]
            return {"status": "AT_POLICE", "message": f"MATCH FOUND! The finder held this item for 7 days but has now surrendered it to authorities. Please visit: {station_name} to claim your property."}
            
        match_room_id = matched_item["unique_identifier"]
        finder_email = matched_item.get("finder_email")
        if finder_email:
            subject = "Match Found: National Registry Alert"
            body = f"An owner has initiated a claim on the item you found.\n\nLog in securely here: {FRONTEND_URL}/index.html?room={match_room_id}&role=Finder"
            dispatch_email(finder_email, subject, body)

        return {"status": "MATCH_FOUND", "message": "URGENT MATCH!", "room_id": match_room_id}
    
    return {"status": "STORED", "message": "Item securely reported. We will email you if it is found."}

@app.post("/api/found-items")
def report_found_item(item: FoundItem):
    clean_serial = item.unique_identifier.strip() if item.unique_identifier else f"SECURE-UUID-{str(uuid.uuid4())}"
    
    supabase.table("items_found").insert({
        "finder_email": item.finder_email, "category": item.category, "color": item.color, 
        "description": item.description, "withheld_feature": item.withheld_feature, 
        "unique_identifier": clean_serial
    }).execute()

    matched_lost_item = find_best_match(item, "items_lost")
    
    # --- NEW: ANTI-LOOP CHECK ---
    if matched_lost_item and matched_lost_item.get("owner_email") == item.finder_email:
        matched_lost_item = None # Cancel the match if testing with the same email

    if matched_lost_item:
        match_room_id = matched_lost_item["unique_identifier"]
        owner_email = matched_lost_item.get("owner_email")
        if owner_email:
            subject = "Match Found: National Registry Alert"
            body = f"A citizen has securely reported an item matching your description.\n\nTo verify ownership, click here: {FRONTEND_URL}/index.html?room={match_room_id}&role=Owner"
            dispatch_email(owner_email, subject, body)
            
        return {"status": "MATCH_FOUND", "message": "URGENT MATCH! The owner has been notified via email.", "room_id": match_room_id}
    
    return {"status": "STORED", "message": "Item secured."}

@app.put("/api/found-items/police")
def register_police_dropoff(dropoff: PoliceDropoff):
    supabase.table("items_found").update({"police_station": dropoff.police_station}).eq("unique_identifier", dropoff.unique_identifier).execute()
    return {"status": "success", "message": "Item successfully transferred to Police custody. Thank you for your civic duty."}

@app.post("/api/chat")
def send_message(msg: ChatMessage):
    supabase.table("secure_messages").insert({
        "room_id": msg.room_id, "sender": msg.sender, "message": msg.message,
        "is_read": False, "fallback_sent": False
    }).execute()
    return {"status": "success"}

@app.get("/api/chat/{room_id}")
def get_messages(room_id: str):
    response = supabase.table("secure_messages").select("*").eq("room_id", room_id).order("created_at").execute()
    return {"data": response.data}

@app.post("/api/chat/read")
def mark_messages_read(receipt: ReadReceipt):
    sender_to_mark = "Finder" if receipt.role == "Owner" else "Owner"
    supabase.table("secure_messages").update({"is_read": True}).eq("room_id", receipt.room_id).eq("sender", sender_to_mark).execute()
    return {"status": "success"}

@app.delete("/api/chat/{room_id}")
def resolve_and_delete_chat(room_id: str):
    supabase.table("secure_messages").delete().eq("room_id", room_id).execute()
    return {"status": "success", "message": "Claim resolved and chat securely erased."}