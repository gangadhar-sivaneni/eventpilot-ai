"""Curate and import:
1. MLRIT EQUINOX 2026 & premier Hyderabad college technical fests (KMIT, GRIET, BVRIT, SNIST)
2. Big Tech corporate hackathons & innovation challenges (Microsoft Imagine Cup, Microsoft AI, Google, Amazon, Flipkart, NVIDIA, Tata, IBM)
into both Supabase and data/store.json.
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

# Load worker env
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(env_path)

from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY")

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "store.json"

SOURCES_TO_ENSURE = [
    {"key": "mlrit_hyd", "name": "MLRIT Hyderabad", "type": "api", "url": "https://mlrit.ac.in", "enabled": True},
    {"key": "kmit_hyd", "name": "KMIT Hyderabad", "type": "api", "url": "https://kmit.in", "enabled": True},
    {"key": "griet_hyd", "name": "GRIET Hyderabad", "type": "api", "url": "https://griet.ac.in", "enabled": True},
    {"key": "bvrit_hyd", "name": "BVRIT Hyderabad", "type": "api", "url": "https://bvrit.ac.in", "enabled": True},
    {"key": "snist_hyd", "name": "SNIST Hyderabad", "type": "api", "url": "https://sreenidhi.edu.in", "enabled": True},
    {"key": "microsoft", "name": "Microsoft", "type": "api", "url": "https://microsoft.com", "enabled": True},
    {"key": "google", "name": "Google", "type": "api", "url": "https://google.com", "enabled": True},
    {"key": "amazon", "name": "Amazon", "type": "api", "url": "https://amazon.com", "enabled": True},
    {"key": "flipkart", "name": "Flipkart", "type": "api", "url": "https://flipkart.com", "enabled": True},
    {"key": "nvidia", "name": "NVIDIA", "type": "api", "url": "https://nvidia.com", "enabled": True},
    {"key": "tata", "name": "Tata Group", "type": "api", "url": "https://tata.com", "enabled": True},
    {"key": "ibm", "name": "IBM", "type": "api", "url": "https://ibm.com", "enabled": True},
]

CURATED_EVENTS = [
    # ─── 1. MLRIT EQUINOX & HYDERABAD COLLEGE FESTS ───
    {
        "external_id": "mlrit-equinox-2026",
        "source_key": "mlrit_hyd",
        "title": "EQUINOX 2026 – National Level Technical Fest & Hackathon",
        "url": "https://mlrit.ac.in/equinox",
        "registration_url": "https://mlrit.ac.in/equinox/register",
        "organizer": "Marri Laxman Reddy Institute of Technology (MLRIT)",
        "city": "Hyderabad",
        "country": "India",
        "format": "in_person",
        "starts_at": "2026-11-21T03:30:00+00:00",
        "ends_at": "2026-11-22T12:30:00+00:00",
        "registration_opens_at": "2026-10-15T00:00:00+00:00",
        "registration_deadline": "2026-11-16T18:29:00+00:00",
        "fee_status": "free",
        "fee_amount": 0,
        "fee_currency": "INR",
        "prize_text": "₹1,50,000 + Merit Trophies & Internships",
        "registration_status": "open",
        "eligibility": "Open to all undergraduate B.Tech / B.E. / MCA engineering students across India.",
        "categories": ["college", "hackathon", "coding", "robotics", "symposium"],
        "description": "EQUINOX 2026 is the premier annual national technical symposium and hackathon organized by Marri Laxman Reddy Institute of Technology (MLRIT), Dundigal, Hyderabad. Key events include 24-Hour Code Sprint Hackathon, AI/ML Project Expo, Autonomous RoboWars & Line Follower, Circuit Master, Paper Presentations, WebMatrix, and Tech Quiz with cash prizes, certificates, and direct industry internship opportunities. Venue: MLRIT Campus, Dundigal, Gandi Maisamma, Hyderabad 500043."
    },
    {
        "external_id": "kmit-trishul-2026",
        "source_key": "kmit_hyd",
        "title": "Trishul 2026 - National Code Odyssey & Hackathon",
        "url": "https://kmit.in/trishul",
        "registration_url": "https://kmit.in/trishul/apply",
        "organizer": "Keshav Memorial Institute of Technology (KMIT)",
        "city": "Hyderabad",
        "country": "India",
        "format": "in_person",
        "starts_at": "2026-11-14T03:30:00+00:00",
        "ends_at": "2026-11-15T12:30:00+00:00",
        "registration_opens_at": "2026-10-10T00:00:00+00:00",
        "registration_deadline": "2026-11-10T18:29:00+00:00",
        "fee_status": "free",
        "fee_amount": 0,
        "fee_currency": "INR",
        "prize_text": "₹1,00,000",
        "registration_status": "open",
        "eligibility": "Open to student developers and coders across India.",
        "categories": ["college", "hackathon", "coding"],
        "description": "36-Hour continuous software sprint focused on Systems Programming, Fullstack Development, and Generative AI at KMIT Campus, Narayanguda, Hyderabad."
    },
    {
        "external_id": "griet-pragnya-2026",
        "source_key": "griet_hyd",
        "title": "Pragnya 2026 - National Level Technical Symposium",
        "url": "https://griet.ac.in/pragnya",
        "registration_url": "https://griet.ac.in/pragnya/register",
        "organizer": "Gokaraju Rangaraju Institute of Engineering & Technology (GRIET)",
        "city": "Hyderabad",
        "country": "India",
        "format": "in_person",
        "starts_at": "2026-11-26T03:30:00+00:00",
        "ends_at": "2026-11-27T12:30:00+00:00",
        "registration_opens_at": "2026-10-15T00:00:00+00:00",
        "registration_deadline": "2026-11-20T18:29:00+00:00",
        "fee_status": "free",
        "fee_amount": 0,
        "fee_currency": "INR",
        "prize_text": "₹1,20,000",
        "registration_status": "open",
        "eligibility": "Open to all engineering college students.",
        "categories": ["college", "symposium", "coding", "hackathon"],
        "description": "Flagship tech fest at GRIET, Bachupally / Nizampet Road, Hyderabad. Features 24-hr Hackathon, Paper Presentation, RoboTrack, and Web Development Battle."
    },
    {
        "external_id": "bvrit-promethean-2026",
        "source_key": "bvrit_hyd",
        "title": "Promethean 2026 - All-India Technical Festival",
        "url": "https://bvrit.ac.in/promethean",
        "registration_url": "https://bvrit.ac.in/promethean/register",
        "organizer": "BVRIT Hyderabad",
        "city": "Hyderabad",
        "country": "India",
        "format": "in_person",
        "starts_at": "2026-11-19T03:30:00+00:00",
        "ends_at": "2026-11-20T12:30:00+00:00",
        "registration_opens_at": "2026-10-15T00:00:00+00:00",
        "registration_deadline": "2026-11-14T18:29:00+00:00",
        "fee_status": "free",
        "fee_amount": 0,
        "fee_currency": "INR",
        "prize_text": "₹1,00,000",
        "registration_status": "open",
        "eligibility": "Open to all engineering and technology disciplines.",
        "categories": ["college", "hackathon", "symposium"],
        "description": "Annual technical fest showcasing innovative student projects, hackathons, and technical design challenges at BVRIT campus, Bachupally / Narsapur."
    },
    {
        "external_id": "snist-roboveda-2026",
        "source_key": "snist_hyd",
        "title": "Roboveda & Sreevision 2026 - National Robotics & Tech Fest",
        "url": "https://sreenidhi.edu.in/roboveda",
        "registration_url": "https://sreenidhi.edu.in/roboveda/register",
        "organizer": "Sreenidhi Institute of Science & Technology (SNIST)",
        "city": "Hyderabad",
        "country": "India",
        "format": "in_person",
        "starts_at": "2026-12-04T03:30:00+00:00",
        "ends_at": "2026-12-06T12:30:00+00:00",
        "registration_opens_at": "2026-10-15T00:00:00+00:00",
        "registration_deadline": "2026-11-25T18:29:00+00:00",
        "fee_status": "free",
        "fee_amount": 0,
        "fee_currency": "INR",
        "prize_text": "₹1,75,000",
        "registration_status": "open",
        "eligibility": "Open to college teams across India.",
        "categories": ["college", "robotics", "hackathon", "iot"],
        "description": "India's largest student-run robotics symposium and tech fest hosted at SNIST, Yamnampet, Ghatkesar, Hyderabad. Features RoboWars, Autonomous Drones, IoT Expo, and AI sprints."
    },

    # ─── 2. BIG TECH & COMPANY EVENTS ───
    {
        "external_id": "msft-imagine-cup-2026",
        "source_key": "microsoft",
        "title": "Microsoft Imagine Cup 2026 - Global Student Tech Championship",
        "url": "https://imaginecup.microsoft.com",
        "registration_url": "https://imaginecup.microsoft.com/register",
        "organizer": "Microsoft",
        "city": "Global (Online / Hybrid)",
        "country": "Worldwide",
        "format": "hybrid",
        "starts_at": "2026-12-01T00:00:00+00:00",
        "ends_at": "2026-12-15T23:59:59+00:00",
        "registration_opens_at": "2026-10-01T00:00:00+00:00",
        "registration_deadline": "2026-11-20T23:59:59+00:00",
        "fee_status": "free",
        "fee_amount": 0,
        "fee_currency": "USD",
        "prize_text": "$100,000 USD + Satya Nadella Mentorship + $50k Azure Grants",
        "registration_status": "open",
        "eligibility": "Students aged 16+ enrolled in accredited high schools or universities worldwide. Teams of 1-4 members.",
        "categories": ["corporate", "hackathon", "ai", "global", "cloud"],
        "description": "Microsoft Imagine Cup is the world's premier student technology and innovation competition. Build purpose-driven applications utilizing Microsoft Azure, OpenAI models, and AI Copilot. Winners receive $100,000 USD, a 1-on-1 mentorship session with Microsoft Chairman & CEO Satya Nadella, and global media exposure."
    },
    {
        "external_id": "msft-azure-fabric-copilot-2026",
        "source_key": "microsoft",
        "title": "Microsoft Fabric & Azure AI Copilot Innovation Challenge",
        "url": "https://reactor.microsoft.com",
        "registration_url": "https://reactor.microsoft.com/challenges/azure-copilot",
        "organizer": "Microsoft",
        "city": "Online",
        "country": "India",
        "format": "online",
        "starts_at": "2026-12-05T04:00:00+00:00",
        "ends_at": "2026-12-07T14:00:00+00:00",
        "registration_opens_at": "2026-10-15T00:00:00+00:00",
        "registration_deadline": "2026-11-28T18:29:00+00:00",
        "fee_status": "free",
        "fee_amount": 0,
        "fee_currency": "INR",
        "prize_text": "₹3,50,000 + Surface Laptops & Microsoft AI Certifications",
        "registration_status": "open",
        "eligibility": "Open to developers, data engineers, and student builders in India.",
        "categories": ["corporate", "ai", "hackathon", "cloud"],
        "description": "Architect intelligent enterprise copilot agents and real-time analytics data pipelines using Microsoft Fabric, Azure OpenAI, and Semantic Kernel. Includes hands-on workshops with Microsoft Cloud Solution Architects."
    },
    {
        "external_id": "google-solution-challenge-2026",
        "source_key": "google",
        "title": "Google Solution Challenge 2026",
        "url": "https://developers.google.com/community/gdsc-solution-challenge",
        "registration_url": "https://developers.google.com/community/gdsc-solution-challenge/register",
        "organizer": "Google",
        "city": "Global (Online)",
        "country": "Worldwide",
        "format": "online",
        "starts_at": "2026-12-10T00:00:00+00:00",
        "ends_at": "2027-01-30T23:59:59+00:00",
        "registration_opens_at": "2026-10-01T00:00:00+00:00",
        "registration_deadline": "2026-12-05T23:59:59+00:00",
        "fee_status": "free",
        "fee_amount": 0,
        "fee_currency": "USD",
        "prize_text": "$12,000 USD per winning team + Google Engineering Mentorship",
        "registration_status": "open",
        "eligibility": "University and college students worldwide. Teams of up to 4 members.",
        "categories": ["corporate", "hackathon", "ai", "global"],
        "description": "The Google Solution Challenge invites university students worldwide to develop solutions for one or more of the United Nations 17 Sustainable Development Goals using Google products including Flutter, Firebase, Google Cloud, and Gemini AI APIs."
    },
    {
        "external_id": "amazon-hackon-2026",
        "source_key": "amazon",
        "title": "Amazon HackOn 2026 - India Campus Edition",
        "url": "https://unstop.com/hackathons/amazon-hackon-2026",
        "registration_url": "https://unstop.com/hackathons/amazon-hackon-2026/register",
        "organizer": "Amazon",
        "city": "Online",
        "country": "India",
        "format": "online",
        "starts_at": "2026-11-28T04:30:00+00:00",
        "ends_at": "2026-11-29T14:30:00+00:00",
        "registration_opens_at": "2026-10-10T00:00:00+00:00",
        "registration_deadline": "2026-11-22T18:29:00+00:00",
        "fee_status": "free",
        "fee_amount": 0,
        "fee_currency": "INR",
        "prize_text": "₹5,00,000 + Amazon SDE-1 Fast-Track Interviews",
        "registration_status": "open",
        "eligibility": "B.Tech/B.E./M.Tech/MCA students graduating in 2026, 2027, or 2028 across engineering colleges in India.",
        "categories": ["corporate", "hackathon", "hiring", "coding"],
        "description": "Amazon India's flagship engineering campus competition. Test your coding, system design, and scalable algorithm skills on high-throughput logistics and customer delivery problems. Top performers earn fast-track interview opportunities for Amazon SDE-1 roles."
    },
    {
        "external_id": "flipkart-grid-70",
        "source_key": "flipkart",
        "title": "Flipkart GRiD 7.0 - Software Development & GenAI Track",
        "url": "https://unstop.com/hackathons/flipkart-grid-70",
        "registration_url": "https://unstop.com/hackathons/flipkart-grid-70/register",
        "organizer": "Flipkart",
        "city": "Online",
        "country": "India",
        "format": "online",
        "starts_at": "2026-11-24T04:30:00+00:00",
        "ends_at": "2026-11-25T14:30:00+00:00",
        "registration_opens_at": "2026-10-05T00:00:00+00:00",
        "registration_deadline": "2026-11-18T18:29:00+00:00",
        "fee_status": "free",
        "fee_amount": 0,
        "fee_currency": "INR",
        "prize_text": "₹6,00,000 + Direct Pre-Placement Interviews (PPI) for SDE-1",
        "registration_status": "open",
        "eligibility": "Engineering students across all Indian colleges. Teams of 2 to 3 members.",
        "categories": ["corporate", "hackathon", "hiring", "coding"],
        "description": "Flipkart GRiD is Flipkart's flagship campus engineering challenge. Tracks include Generative AI for Conversational Commerce, Autonomous Robotics in Fulfillment, and High-Scale Low-Latency Infrastructure. Winners secure cash prizes and PPIs with Flipkart."
    },
    {
        "external_id": "nvidia-ai-challenge-2026",
        "source_key": "nvidia",
        "title": "NVIDIA AI Developer Challenge - Generative AI Sprint",
        "url": "https://developer.nvidia.com/ai-challenge",
        "registration_url": "https://developer.nvidia.com/ai-challenge/apply",
        "organizer": "NVIDIA",
        "city": "Online",
        "country": "Worldwide",
        "format": "online",
        "starts_at": "2026-12-12T04:00:00+00:00",
        "ends_at": "2026-12-14T14:00:00+00:00",
        "registration_opens_at": "2026-10-15T00:00:00+00:00",
        "registration_deadline": "2026-12-10T18:29:00+00:00",
        "fee_status": "free",
        "fee_amount": 0,
        "fee_currency": "USD",
        "prize_text": "$25,000 USD in NVIDIA RTX GPUs & Cloud Compute",
        "registration_status": "open",
        "eligibility": "Open to developers, researchers, and students building with CUDA / PyTorch.",
        "categories": ["corporate", "ai", "hackathon"],
        "description": "Build high-speed generative AI, computer vision, or multimodal agent pipelines accelerated by NVIDIA TensorRT-LLM and NVIDIA NIM microservices. Prizes include top-tier NVIDIA workstation GPUs and cloud credits."
    },
    {
        "external_id": "tata-innoverse-2026",
        "source_key": "tata",
        "title": "Tata InnoVerse & Tata Crucible Hackathon 2026",
        "url": "https://unstop.com/competitions/tata-crucible-campus-hackathon-2026",
        "registration_url": "https://unstop.com/competitions/tata-crucible-campus-hackathon-2026/register",
        "organizer": "Tata Group",
        "city": "Hyderabad / Hybrid",
        "country": "India",
        "format": "hybrid",
        "starts_at": "2026-11-20T04:00:00+00:00",
        "ends_at": "2026-11-21T13:00:00+00:00",
        "registration_opens_at": "2026-10-10T00:00:00+00:00",
        "registration_deadline": "2026-11-14T18:29:00+00:00",
        "fee_status": "free",
        "fee_amount": 0,
        "fee_currency": "INR",
        "prize_text": "₹4,00,000 + Tata Group Leadership Mentorship",
        "registration_status": "open",
        "eligibility": "Full-time students enrolled in recognized Indian colleges and universities.",
        "categories": ["corporate", "innovation", "hackathon"],
        "description": "Tata InnoVerse challenges student innovators to solve real engineering problems for Tata companies in renewable energy, circular economy, and digital industrial automation. Finals held with Tata leadership."
    },
    {
        "external_id": "ibm-call-for-code-2026",
        "source_key": "ibm",
        "title": "IBM Call for Code Global Challenge 2026",
        "url": "https://callforcode.org",
        "registration_url": "https://callforcode.org/register",
        "organizer": "IBM",
        "city": "Global (Online)",
        "country": "Worldwide",
        "format": "online",
        "starts_at": "2026-12-01T00:00:00+00:00",
        "ends_at": "2026-12-20T23:59:59+00:00",
        "registration_opens_at": "2026-10-01T00:00:00+00:00",
        "registration_deadline": "2026-11-30T23:59:59+00:00",
        "fee_status": "free",
        "fee_amount": 0,
        "fee_currency": "USD",
        "prize_text": "$50,000 USD + Red Hat & watsonx Deployment Incubation",
        "registration_status": "open",
        "eligibility": "Developers, university students, and problem solvers worldwide.",
        "categories": ["corporate", "hackathon", "ai", "global"],
        "description": "The largest global tech initiative addressing humanitarian, sustainability, and disaster response challenges. Build open-source applications powered by IBM watsonx AI and Red Hat OpenShift."
    }
]

def sync_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[!] Supabase credentials missing from worker/.env")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # 1. Ensure sources exist
    source_id_map = {}
    existing_sources = supabase.table("event_sources").select("id,key").execute().data or []
    for s in existing_sources:
        source_id_map[s["key"]] = s["id"]

    for src in SOURCES_TO_ENSURE:
        key = src["key"]
        if key not in source_id_map:
            res = supabase.table("event_sources").insert(src).execute()
            if res.data:
                source_id_map[key] = res.data[0]["id"]
                print(f"[Source +] Added source {src['name']} (ID {res.data[0]['id']})")
        else:
            print(f"[Source ✓] Exists: {key} (ID {source_id_map[key]})")

    inserted = 0
    updated = 0

    for ev in CURATED_EVENTS:
        ev_copy = dict(ev)
        src_key = ev_copy.pop("source_key", None)
        ev_copy["source_id"] = source_id_map.get(src_key, 3) # fallback to unstop or id
        ev_copy["last_checked_at"] = now_iso
        ev_copy["first_seen_at"] = now_iso

        # Check if already in Supabase
        existing = supabase.table("events").select("id").eq("external_id", ev["external_id"]).execute()
        if existing.data:
            supabase.table("events").update(ev_copy).eq("id", existing.data[0]["id"]).execute()
            updated += 1
            print(f"[✓] Updated: {ev['title']}")
        else:
            supabase.table("events").insert(ev_copy).execute()
            inserted += 1
            print(f"[+] Inserted: {ev['title']}")

    print(f"Supabase sync complete: {inserted} inserted, {updated} updated.")

def sync_local_store():
    if not DATA_PATH.exists():
        print(f"[!] {DATA_PATH} not found")
        return

    with open(DATA_PATH, "r", encoding="utf-8") as f:
        store = json.load(f)

    events = store.get("events", [])
    now_iso = datetime.now(timezone.utc).isoformat()
    existing_by_ext = {e.get("external_id"): e for e in events if e.get("external_id")}

    max_id = max((e.get("id", 0) for e in events), default=0)

    for ev in CURATED_EVENTS:
        ev_clean = dict(ev)
        ev_clean.pop("source_key", None)
        ext_id = ev["external_id"]
        if ext_id in existing_by_ext:
            existing_by_ext[ext_id].update(ev_clean)
            existing_by_ext[ext_id]["last_checked_at"] = now_iso
            print(f"[Store ✓] Updated: {ev['title']}")
        else:
            max_id += 1
            new_item = dict(ev_clean)
            new_item["id"] = max_id
            new_item["last_checked_at"] = now_iso
            new_item["first_seen_at"] = now_iso
            events.append(new_item)
            existing_by_ext[ext_id] = new_item
            print(f"[Store +] Added: {ev['title']}")

    store["events"] = events
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2, ensure_ascii=False)
    print(f"Local store updated: {len(events)} total events.")

if __name__ == "__main__":
    sync_supabase()
    sync_local_store()
