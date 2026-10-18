"""Clearly-labelled fake events for tests and local demos. Disabled in the seeded source registry."""
KEY = "synthetic"
ALLOWED_HOSTS: set[str] = set()


def fetch():
    yield {"external_id": "syn-1", "url": "https://example.com/synthetic/hackathon", "title": "[TEST] Synthetic Hackathon",
           "organizer": "EventPilot test data", "format": "online", "registration_status": "open",
           "registration_deadline": "2099-12-31", "fee_status": "free", "prize_text": "₹10,000", "categories": ["hackathon", "test"]}
    yield {"external_id": "syn-2", "url": "https://example.com/synthetic/workshop", "title": "[TEST] Synthetic Paid Workshop",
           "organizer": "EventPilot test data", "format": "in_person", "city": "Hyderabad", "country": "India",
           "registration_opens_at": "2099-01-01T09:00:00Z", "registration_deadline": "2099-02-01",
           "fee_status": "paid", "fee_amount": 499, "fee_currency": "INR", "categories": ["workshop", "test"]}
    yield {"external_id": "syn-3", "url": "https://example.com/synthetic/meetup", "title": "[TEST] Synthetic Meetup (fee unknown)",
           "format": "hybrid", "categories": ["meetup", "test"]}
