DASHBOARD = {
    "total_spending": 2847.62,
    "spending_change": -8.4,
    "receipts_captured": 38,
    "receipts_needing_review": 12,
    "monthly_budget": 4200,
    "monthly_budget_used_percent": 67.8,
    "recent_receipts": [
        {"id": "adobe", "filename": "adobe-creative-cloud.pdf", "merchant": "Adobe Creative Cloud", "date": "Mar 18, 2025", "amount": 54.99, "category": "Software"},
        {"id": "loblaws", "filename": "loblaws-march-16.pdf", "merchant": "Loblaws", "date": "Mar 16, 2025", "amount": 86.42, "category": "Groceries"},
        {"id": "air-canada", "filename": "air-canada-flight.pdf", "merchant": "Air Canada", "date": "Mar 12, 2025", "amount": 326, "category": "Travel"},
        {"id": "notion", "filename": "notion-march.pdf", "merchant": "Notion", "date": "Mar 08, 2025", "amount": 16, "category": "Software"},
    ],
}

TEAMS = [
    {"id": "personal", "name": "Personal", "budget": 10000, "used": 4200, "members": [{"name": "Alex Morgan", "role": "Lead"}, {"name": "Jamie Lee", "role": "Member"}], "receipts": DASHBOARD["recent_receipts"]},
    {"id": "northwind", "name": "Northwind Co.", "budget": 18000, "used": 15120, "members": [{"name": "Sam Rivera", "role": "Lead"}, {"name": "Priya Shah", "role": "Co-Lead"}, {"name": "Taylor Kim", "role": "Member"}], "receipts": [{"id": "figma", "filename": "figma-team-plan.pdf", "merchant": "Figma", "date": "Mar 14, 2025", "amount": 240, "category": "Software"}, {"id": "delta", "filename": "delta-client-trip.pdf", "merchant": "Delta Airlines", "date": "Mar 06, 2025", "amount": 780, "category": "Travel"}]},
    {"id": "side-project", "name": "Side project", "budget": 2500, "used": 130, "members": [{"name": "Alex Morgan", "role": "Lead"}], "receipts": []},
    {"id": "dance-team", "name": "Dance team", "budget": 5000, "used": 3200, "members": [{"name": "Jamie Lee", "role": "Lead"}, {"name": "Taylor Kim", "role": "Member"}], "receipts": [{"id": "dance-studio", "filename": "dance-studio-march.pdf", "merchant": "Dance Studio", "date": "Mar 10, 2025", "amount": 120, "category": "Classes"}]},
]
