# 🏛️ Thulamela Municipality Community Services System

A secure web-based platform that digitises how residents in the villages of Thulamela
Municipality report community problems to the correct government department, and how
departments and the municipality manage those reports.

## 📌 Overview

The Thulamela Community Services System replaces informal, hard-to-track ways of reporting
community problems with a single digital platform. It eliminates:

- Uncertainty about which department to approach
- Paper-based or word-of-mouth complaints
- Manual, untracked follow-up on reported problems
- Departments having no shared view of what has been reported

The system improves accountability and turnaround time, while keeping resident accounts and
report data behind authenticated, role-based access.

## 🎯 Problem Statement

Residents in Thulamela's villages often have difficulty reporting community problems to the
right government department. Common issues include:

- Not knowing which department handles a given problem
- No way to follow up on a complaint once it has been made
- Delays in communication between residents and departments
- Departments struggling to organise, filter and monitor incoming reports

This leads to:

- Problems going unresolved or unreported
- Duplicate or lost complaints
- Residents unable to track progress
- Heavy, disorganised administrative workload for departments

## 💡 Proposed Solution

The system provides a centralised digital platform where:

### 🧑‍🤝‍🧑 Residents can:
- Create a secure account and log in with a phone number and password
- Recover a forgotten password using an OTP sent by SMS
- Select the correct government department from a list of eight
- Submit a report with a category, description, photo evidence, village, specific
  location and date
- Save an incomplete report as a draft and finish it later
- Track the status of every report they have submitted
- Receive SMS and email notifications when a report is submitted or approved

### 🏢 Department administrators can:
- Log in with a department-specific ID and password
- View only the reports submitted to their own department
- Approve or decline a report, which updates its status for the resident
- Mark an approved report as resolved once the problem is addressed
- Generate statistics for their department (total, approved and declined reports)

### 🏛️ The Main/Municipality administrator can:
- View reports from all eight departments, with a department filter
- View total registered residents and total reports
- View reports under investigation, in progress and resolved, municipality-wide
- Generate overall statistics for monitoring and analysis

## 🏢 Supported Departments

- Department of Education
- Department of Agriculture
- Department of Home Affairs
- Department of Health
- Department of Water and Sanitation
- Department of Public Works and Infrastructure
- Department of Transport
- Department of Human Settlements

## 🛠️ Technologies Used

**Backend**
- Node.js with Express – server-side routing and business logic
- SQLite (Node's built-in `node:sqlite` driver) – relational database, no separate database
  server or compiled dependencies required
- bcryptjs – password hashing
- jsonwebtoken (JWT) – authentication tokens
- Nodemailer – email delivery
- Twilio or SMSPortal – SMS delivery

**Frontend**
- HTML, CSS and JavaScript (no framework), served as a single page by the Express server

## 🗄️ Database Architecture

The system uses a SQLite relational database file (`thulamela.db`), created automatically
the first time the server starts.

**Core tables:**
- `Resident` – resident accounts
- `Administrator` – department and main administrator accounts
- `Department` – the eight supported departments
- `Report` – submitted reports and their status
- `Draft` – incomplete, unsubmitted reports
- `Notification` – a record of every SMS and email sent
- `OtpRequest` – one-time PINs used for password recovery

Foreign keys enforce that every report and draft belongs to a real resident and department,
and every administrator belongs to a real department (except the Main Administrator).

## 🔐 Security & Authentication

- **Password hashing:** resident and administrator passwords are stored as bcrypt hashes,
  never as plain text.
- **JWT authentication:** every resident and admin action after login is authorised with a
  signed, expiring token.
- **Role-based access:** residents, department administrators and the Main Administrator each
  see only the data their role is allowed to see. A department administrator can only view and
  act on reports belonging to their own department.
- **OTP password recovery:** a one-time PIN is sent by SMS and expires after 10 minutes.
- **Basic rate limiting** on login and registration endpoints to slow down repeated guessing.

## 📲 Notifications

- **Email** is sent through Gmail (or any SMTP provider) using Nodemailer.
- **SMS** is sent through SMSPortal or Twilio.
- Without provider settings configured, SMS and email are logged to the terminal and shown
  as on-screen pop-ups, so the system is fully testable during development.

## 🚀 Key Features

- Secure, hashed-password authentication for residents and administrators
- Role-based access control (Resident / Department Admin / Main Admin)
- Online report submission with photo evidence
- Draft saving for incomplete reports
- Automatic SMS and email notifications
- Department-level and municipality-wide report statistics
- Status tracking (Submitted → Approved/Declined → Resolved)

## 📊 System Benefits

**For residents**
- No need to travel to a department office to report a problem
- Clear, trackable status for every report
- Immediate SMS and email confirmation

**For department administrators**
- A single, filtered view of only their department's reports
- Digital approve/decline/resolve workflow, with no manual record-keeping
- Instant department statistics

**For the municipality**
- A real-time, municipality-wide view of reports and departmental performance
- Easier monitoring and decision-making

## ⚙️ Running the Application

1. Install dependencies:
2.2. (Optional) Set up real SMS and email by copying `.env.example` to `.env` and filling in
   your SMSPortal or Twilio and Gmail details.
3. Start the server:
4.4. Open `http://localhost:3000` in a browser.

## 🔑 Demo Admin Logins

| Department | Admin ID | Password |
|---|---|---|
| Education | `EducationAdmin` | `Educ@2026` |
| Agriculture | `AgricultureAdmin` | `Agri@2026` |
| Home Affairs | `HomeAffairsAdmin` | `HomeAff@2026` |
| Health | `HealthAdmin` | `Health@2026` |
| Water and Sanitation | `WaterSanitationAdmin` | `WaterSan@2026` |
| Public Works and Infrastructure | `PublicWorksAdmin` | `PubWorks@2026` |
| Transport | `TransportAdmin` | `Transport@2026` |
| Human Settlements | `HumanSettlementsAdmin` | `HumanSet@2026` |
| Main / Municipality | `MainAdmin` | `MainAdmin@2026` |

Residents sign up for their own account in the app.

## 👨‍💻 Author

Developed as an academic project in the University of Venda.

