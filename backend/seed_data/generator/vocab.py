"""Fictional names, geography and complaint wording for the synthetic data. No real institutions."""

from typing import Dict, List, Tuple

# region -> state -> districts. Districts are real places; every institution built on them is fictional.
GEOGRAPHY: Dict[str, Dict[str, List[str]]] = {
    "central": {"Madhya Pradesh": ["Jabalpur", "Bhopal", "Indore", "Gwalior", "Sagar"], "Chhattisgarh": ["Raipur", "Bilaspur"]},
    "eastern": {"West Bengal": ["Kolkata", "Howrah", "Durgapur"], "Odisha": ["Bhubaneswar", "Cuttack"], "Bihar": ["Patna", "Gaya"]},
    "north_eastern": {"Assam": ["Guwahati", "Dibrugarh"], "Meghalaya": ["Shillong"]},
    "northern": {"Uttar Pradesh": ["Lucknow", "Kanpur", "Varanasi", "Noida"], "Uttarakhand": ["Dehradun"]},
    "north_western": {"Punjab": ["Ludhiana", "Amritsar"], "Haryana": ["Gurugram", "Panipat"], "Himachal Pradesh": ["Shimla", "Solan"]},
    "south_central": {"Telangana": ["Hyderabad", "Warangal"]},
    "south_eastern": {"Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur"]},
    "southern": {"Tamil Nadu": ["Chennai", "Coimbatore", "Madurai"]},
    "south_western": {"Karnataka": ["Bengaluru", "Mysuru", "Hubballi"], "Kerala": ["Kochi", "Thiruvananthapuram"]},
    "western": {"Maharashtra": ["Pune", "Nagpur", "Nashik", "Mumbai"], "Gujarat": ["Ahmedabad", "Vadodara", "Surat", "Bharuch"], "Rajasthan": ["Jaipur", "Udaipur"]},
}
# How many institutions each region gets, in tenths (central and western are the busiest).
REGION_WEIGHT = {"central": 20, "eastern": 9, "north_eastern": 4, "northern": 14, "north_western": 9,
                 "south_central": 8, "south_eastern": 7, "southern": 10, "south_western": 11, "western": 18}

# One extra locality per district: what a complainant writes when they give a city instead of the district.
# These are also district aliases in abbreviations.json, so the resolver can read them.
LOCALITIES: Dict[str, str] = {
    "Jabalpur": "Adhartal", "Bhopal": "Kolar", "Indore": "Rau", "Gwalior": "Morar", "Sagar": "Makronia",
    "Raipur": "Naya Raipur", "Bilaspur": "Tifra", "Kolkata": "Salt Lake", "Howrah": "Liluah", "Durgapur": "Benachity",
    "Bhubaneswar": "Khandagiri", "Cuttack": "Choudwar", "Patna": "Danapur", "Gaya": "Bodh Gaya", "Guwahati": "Dispur",
    "Dibrugarh": "Naharkatia", "Shillong": "Laitumkhrah", "Lucknow": "Chinhat", "Kanpur": "Panki", "Varanasi": "Ramnagar",
    "Noida": "Greater Noida", "Dehradun": "Rajpur", "Ludhiana": "Sahnewal", "Amritsar": "Majitha", "Gurugram": "Manesar",
    "Panipat": "Samalkha", "Shimla": "Sanjauli", "Solan": "Baddi", "Hyderabad": "Secunderabad", "Warangal": "Hanamkonda",
    "Visakhapatnam": "Gajuwaka", "Vijayawada": "Gannavaram", "Guntur": "Tenali", "Chennai": "Tambaram", "Coimbatore": "Pollachi",
    "Madurai": "Thirumangalam", "Bengaluru": "Yelahanka", "Mysuru": "Nanjangud", "Hubballi": "Dharwad", "Kochi": "Aluva",
    "Thiruvananthapuram": "Neyyattinkara", "Pune": "Pimpri", "Nagpur": "Kamptee", "Nashik": "Deolali", "Mumbai": "Thane",
    "Ahmedabad": "Naroda", "Vadodara": "Karjan", "Surat": "Kamrej", "Bharuch": "Ankleshwar", "Jaipur": "Sanganer", "Udaipur": "Debari",
}

# Name parts. Tiny-seed places (Vindhya, Narmada, Valley, Satpura, Sarovar, Mahakaushal, Deccan, Plateau) are left out
# so a generated name can never be confused with the hero institutions.
PLACE_WORDS = [
    "Aravali", "Sahyadri", "Kaveri", "Godavari", "Mahanadi", "Shivalik", "Nilgiri", "Sundarban", "Brahmaputra", "Gangotri",
    "Himgiri", "Ratnagiri", "Malwa", "Bundel", "Chambal", "Konkan", "Malabar", "Coromandel", "Kathiawar", "Marwar",
    "Doaba", "Terai", "Kamrup", "Utkal", "Anga", "Magadh", "Mithila", "Awadh", "Rohilkhand", "Garhwal",
    "Kumaon", "Dandaka", "Telangi", "Rayala", "Pandya", "Chola", "Kadamba", "Hoysala", "Vengi", "Tungabhadra",
]
FOUNDER_WORDS = [
    "Saraswati", "Gyan", "Prabhat", "Lakshya", "Dhruv", "Kalpana", "Ananta", "Tejas", "Pragati", "Navjeevan",
    "Siddharth", "Mitra", "Ishwar", "Surya", "Chandra", "Kiran", "Vidya", "Samarth", "Udaya", "Pratibha",
    "Rishi", "Tapasya", "Nirmal", "Vikas", "Aarohan", "Ujjwal", "Sankalp", "Bharat", "Shakti", "Gurukul",
    "Manthan", "Abhyudaya", "Nalanda", "Takshila", "Vaishali", "Kalyani", "Maitri", "Dharohar", "Srijan", "Pariksha",
]
TYPE_SUFFIX: Dict[str, List[str]] = {
    "engineering": ["Institute of Engineering & Technology", "College of Engineering", "Institute of Technology", "Engineering College"],
    "management": ["Institute of Management", "School of Management Studies", "Business School"],
    "pharmacy": ["College of Pharmacy", "Institute of Pharmaceutical Sciences"],
    "polytechnic": ["Polytechnic", "Polytechnic College", "Technical Institute"],
    "university": ["Technical University", "University of Technology"],
}
DEPARTMENT_AREAS = ["Pharmacy", "Management Studies", "Computer Applications", "Architecture", "Design", "Applied Sciences", "Hotel Management", "Planning"]
TRUST_KINDS = ["Education Trust", "Educational Society", "Foundation", "Shiksha Samiti", "Charitable Trust"]

FIRST_NAMES = ["Aarav", "Anjali", "Deepak", "Farhan", "Geeta", "Harish", "Isha", "Jatin", "Kavya", "Lalit", "Meena", "Nitin", "Om", "Pooja",
               "Qasim", "Ritika", "Sandeep", "Tanvi", "Umesh", "Vandana", "Yash", "Zoya", "Alok", "Bhavna", "Chetan", "Divya", "Ehsan", "Gauri"]
LAST_NAMES = ["Sharma", "Verma", "Patil", "Nair", "Iyer", "Reddy", "Khan", "Singh", "Das", "Mishra", "Joshi", "Kulkarni", "Banerjee",
              "Pillai", "Chauhan", "Mehta", "Bose", "Rao", "Tiwari", "Gupta", "Dubey", "Yadav", "Thakur", "Menon"]

# ── Complaint wording ────────────────────────────────────────────────────

OPENINGS = {
    "student": "I am a student of the institution.",
    "parent": "My ward is a student of the institution.",
    "faculty": "I am a faculty member at the institution.",
    "staff": "I work as non-teaching staff at the institution.",
    "public": "I am writing about the institution.",
    "anonymous": "A concerned person reports the following about the institution.",
    "internal": "Inspection note on the institution.",
}
ASKS = [
    "Please look into the matter and direct the institution to respond.",
    "I request AICTE to take action and inform me of the outcome.",
    "Kindly verify the records and ensure the issue is resolved at the earliest.",
    "The matter has been pending for a long time; urgent intervention is requested.",
    "Please treat this as a formal complaint and register it for follow-up.",
]
# category code -> (subjects, issue sentences). Index j of the issue sentences is the "same matter" key.
CATEGORY_TEXT: Dict[str, Tuple[List[str], List[str]]] = {
    "fee_refund": (
        ["Fee refund refused after withdrawal", "Refund of tuition fee not paid", "Institution keeps full fee after admission cancelled", "Caution money and fees not returned"],
        ["I withdrew my admission within the notified period but the institution refuses to refund the tuition fee and keeps the full amount.",
         "The institution has not returned the caution deposit and the fees paid for the semester after the admission was cancelled.",
         "Despite several written requests, the refund of the fee paid at admission has not been credited to my account.",
         "The college deducted a large processing charge from the refund and will not give a written explanation for it."]),
    "certificate_withheld": (
        ["Original certificates withheld", "10th/12th mark sheets not returned", "Degree certificate not issued", "Documents held back until fees are paid"],
        ["The institution is not returning the original 10th and 12th certificates and is demanding fees for all years before releasing them.",
         "My provisional and degree certificates have been withheld although the course is complete and no dues are pending.",
         "The college refuses to hand over the original mark sheets and migration certificate unless an extra payment is made.",
         "The original documents deposited at admission have been withheld for months and the office gives no reason."]),
    "admission_irregularity": (
        ["Admission against merit list", "Seats sold outside counselling", "Admission without eligibility check", "Irregular admission in management quota"],
        ["Candidates with lower rank were admitted over the merit list and the counselling process was bypassed.",
         "Seats were filled through direct payment outside the approved counselling, which is against the admission rules.",
         "Students were admitted without verifying the eligibility marks required for the programme.",
         "The management quota was used beyond the approved limit and the admission records were backdated."]),
    "faculty_shortage": (
        ["Faculty shortage found", "Classes without qualified teachers", "Faculty strength below norms", "Fake faculty shown during inspection"],
        ["The number of qualified faculty is far below the AICTE norm for the approved intake and classes are not held regularly.",
         "Several departments have no full-time professor, and visiting staff are shown as permanent faculty on paper.",
         "Faculty names submitted for approval are not actually teaching at the campus and the same staff are listed in other colleges.",
         "Teachers have left and the posts are vacant for more than a year, affecting the syllabus coverage."]),
    "infrastructure_deficiency": (
        ["Infrastructure below approval norms", "Laboratories and library inadequate", "Classrooms and hostel in poor condition", "Built-up area less than declared"],
        ["The laboratories, library and classrooms are below the standards declared in the approval and mandatory disclosure.",
         "The built-up area and hostel facilities do not match what the institution reported to AICTE.",
         "Equipment listed for the laboratories is missing and the library has very few books for the programmes offered.",
         "The campus has unsafe buildings and no proper sanitation, contrary to the approved infrastructure."]),
    "salary_non_payment": (
        ["Salary not paid to faculty", "Salary arrears pending", "Provident fund not deposited", "Staff dismissed without dues"],
        ["The institution has not paid the monthly salary to teaching staff for several months despite repeated requests.",
         "Arrears under the pay scale have not been released and the management gives only verbal assurances.",
         "Salary is deducted for provident fund but the amount has not been deposited with the authorities.",
         "Staff were removed from service without notice and their final dues remain unpaid."]),
    "ragging": (
        ["Ragging complaint", "Senior students harassing freshers", "Ragging in hostel", "Anti-ragging committee inactive"],
        ["First-year students are being ragged in the hostel by senior students and the warden has taken no action.",
         "Freshers are forced to perform humiliating acts at night and are threatened if they report it.",
         "The anti-ragging committee does not meet and complaints made to the principal were ignored.",
         "A student was physically hurt during ragging and the institution tried to hide the incident."]),
    "unapproved_course": (
        ["Course run without approval", "Unapproved intake admitted", "Programme not approved by AICTE", "Admissions above approved intake"],
        ["The institution is running a programme that is not approved by AICTE and has admitted students into it.",
         "More students were admitted than the approved intake, and their degrees may not be valid.",
         "A new course was advertised and started although the approval process was not complete.",
         "The institution is conducting a diploma programme without the required approval and collecting full fees."]),
    "scholarship": (
        ["Scholarship not credited", "Scholarship amount withheld by institution", "Fee reimbursement pending", "Scholarship forms not forwarded"],
        ["The scholarship amount has been received by the institution but not passed on to the students.",
         "The institution has not forwarded the scholarship applications, so eligible students lost the benefit this year.",
         "The fee reimbursement under the scheme is pending for two years and the institution is asking students to pay again.",
         "The college is demanding a part of the scholarship money as a charge before releasing the remaining amount."]),
    "harassment": (
        ["Harassment by staff", "Complaint of harassment not heard", "Misbehaviour by faculty", "Unsafe conduct complaint"],
        ["A faculty member is harassing students and the internal committee has not registered the complaint.",
         "The complainant faced repeated misbehaviour from a staff member and the management ignored the written complaint.",
         "Students who complained about the conduct of a teacher were threatened with failing marks.",
         "The institution has no functioning internal complaints committee and a harassment case is being hushed up."]),
    "exam_result": (
        ["Examination result not declared", "Result withheld without reason", "Marks mismatch in result", "Re-evaluation not conducted"],
        ["The examination result has not been declared for months and the students cannot apply for further studies.",
         "The result of one subject is withheld without any reason and the institution gives no written reply.",
         "The marks in the result differ from the marks in the answer sheet shown to the student.",
         "The request for re-evaluation was accepted with a fee but the revised result has never been issued."]),
    "other": (
        ["General grievance against institution", "Institution not responding to queries", "Misleading advertisement", "Administrative lapse"],
        ["The institution does not respond to written queries and the office staff refuse to take applications.",
         "The advertisement of the institution claims placements and facilities that do not exist.",
         "There are repeated administrative lapses in record keeping and the grievance cell does not function.",
         "The institution changed the rules after admission and does not publish the notices for students."]),
}
REMARKS = {
    "assign": ["Assigned for verification with the institution.", "Allotted to the concerned officer for examination.", "Marked to the desk officer to seek a report."],
    "interim_reply": ["Interim reply sent; report awaited from the institution.", "Complainant informed that the institution has been asked to respond."],
    "transfer": ["Transferred as the subject falls under another bureau.", "Forwarded to the competent bureau for action."],
    "escalate": ["No response from the institution; escalated for senior attention.", "Escalated as the case is close to its SLA."],
    "dispose": ["Institution complied; complainant informed.", "Closed after verification of the records.", "Not maintainable under AICTE norms; complainant informed."],
    "reopen": ["Complainant reports the issue persists; reopened.", "New evidence submitted by the complainant."],
    "remark": ["Reminder sent to the institution.", "Follow-up noted on the file.", "Documents received from the complainant."],
}
NEXT_ACTIONS = ["Await the institution's reply", "Seek supporting records from the institution", "Schedule verification visit", "Send reminder to the institution"]
UNKNOWN_INSTITUTION_HINT = "not in the AICTE registry"
