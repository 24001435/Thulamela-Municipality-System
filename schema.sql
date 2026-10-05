-- Thulamela Municipality Community Services System: database schema (SQLite).
-- Tables follow section 4 of the design document. Portable to PostgreSQL/MySQL
-- (replace AUTOINCREMENT / CURRENT_TIMESTAMP defaults as needed).

CREATE TABLE IF NOT EXISTS Department (
  DepartmentID   INTEGER PRIMARY KEY AUTOINCREMENT,
  Code           TEXT NOT NULL UNIQUE,              -- short code used by the UI, e.g. 'hlt'
  DepartmentName TEXT NOT NULL UNIQUE,
  Logo           TEXT
);

CREATE TABLE IF NOT EXISTS Administrator (
  AdminID      INTEGER PRIMARY KEY AUTOINCREMENT,
  AdminName    TEXT NOT NULL,
  UniqueID     TEXT NOT NULL UNIQUE,                -- e.g. 'HLT-01', 'MAIN-001'
  Email        TEXT UNIQUE,
  Password     TEXT,                                -- optional bcrypt hash; if set, login also needs it
  DepartmentID INTEGER REFERENCES Department(DepartmentID),
  AdminType    TEXT NOT NULL CHECK (AdminType IN ('DEPARTMENT','MAIN')),
  CHECK ((AdminType='MAIN' AND DepartmentID IS NULL) OR (AdminType='DEPARTMENT' AND DepartmentID IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS Resident (
  ResidentID  INTEGER PRIMARY KEY AUTOINCREMENT,
  FirstName   TEXT NOT NULL,
  LastName    TEXT NOT NULL,
  PhoneNumber TEXT NOT NULL UNIQUE,
  Email       TEXT NOT NULL UNIQUE,                 -- stored lower-case
  Password    TEXT NOT NULL,                        -- bcrypt hash, never plain text
  CreatedAt   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Report (
  ReportID         INTEGER PRIMARY KEY AUTOINCREMENT,
  ResidentID       INTEGER NOT NULL REFERENCES Resident(ResidentID),
  DepartmentID     INTEGER NOT NULL REFERENCES Department(DepartmentID),
  Category         TEXT NOT NULL,
  Description      TEXT NOT NULL,
  ImagePath        TEXT NOT NULL,
  VillageName      TEXT NOT NULL,
  SpecificLocation TEXT NOT NULL,
  AccidentDate     TEXT NOT NULL,
  SubmissionDate   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Status           TEXT NOT NULL DEFAULT 'Submitted'
                   CHECK (Status IN ('Submitted','Approved','Declined','Resolved'))
);
CREATE INDEX IF NOT EXISTS idx_report_dept     ON Report(DepartmentID, Status);
CREATE INDEX IF NOT EXISTS idx_report_resident ON Report(ResidentID);

CREATE TABLE IF NOT EXISTS Draft (
  DraftID          INTEGER PRIMARY KEY AUTOINCREMENT,
  ResidentID       INTEGER NOT NULL REFERENCES Resident(ResidentID) ON DELETE CASCADE,
  DepartmentID     INTEGER NOT NULL REFERENCES Department(DepartmentID),
  Category         TEXT,
  Description      TEXT,
  ImagePath        TEXT,
  VillageName      TEXT,
  SpecificLocation TEXT,
  AccidentDate     TEXT,
  LastUpdated      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Notification (
  NotificationID   INTEGER PRIMARY KEY AUTOINCREMENT,
  ResidentID       INTEGER NOT NULL REFERENCES Resident(ResidentID) ON DELETE CASCADE,
  ReportID         INTEGER REFERENCES Report(ReportID),
  NotificationType TEXT NOT NULL CHECK (NotificationType IN ('SMS','EMAIL')),
  Message          TEXT NOT NULL,
  DateSent         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Status           TEXT NOT NULL                    -- SENT, LOGGED (no provider configured) or FAILED
);

CREATE TABLE IF NOT EXISTS OtpRequest (             -- password recovery
  OtpID      INTEGER PRIMARY KEY AUTOINCREMENT,
  ResidentID INTEGER NOT NULL REFERENCES Resident(ResidentID) ON DELETE CASCADE,
  CodeHash   TEXT NOT NULL,
  ExpiresAt  INTEGER NOT NULL,                      -- unix ms
  Attempts   INTEGER NOT NULL DEFAULT 0,
  Verified   INTEGER NOT NULL DEFAULT 0,
  Used       INTEGER NOT NULL DEFAULT 0
);

-- Seed data (safe to run repeatedly)
INSERT OR IGNORE INTO Department (Code, DepartmentName) VALUES
 ('edu','Department of Education'),
 ('agr','Department of Agriculture'),
 ('haf','Department of Home Affairs'),
 ('hlt','Department of Health'),
 ('was','Department of Water and Sanitation'),
 ('pwi','Department of Public Works and Infrastructure'),
 ('trn','Department of Transport'),
 ('hse','Department of Human Settlements');


INSERT OR IGNORE INTO Administrator (AdminName, UniqueID, DepartmentID, AdminType)
  SELECT 'Education Admin', 'EducationAdmin', DepartmentID, 'DEPARTMENT' FROM Department WHERE Code='edu';
INSERT OR IGNORE INTO Administrator (AdminName, UniqueID, DepartmentID, AdminType)
  SELECT 'Agriculture Admin', 'AgricultureAdmin', DepartmentID, 'DEPARTMENT' FROM Department WHERE Code='agr';
INSERT OR IGNORE INTO Administrator (AdminName, UniqueID, DepartmentID, AdminType)
  SELECT 'Home Affairs Admin', 'HomeAffairsAdmin', DepartmentID, 'DEPARTMENT' FROM Department WHERE Code='haf';
INSERT OR IGNORE INTO Administrator (AdminName, UniqueID, DepartmentID, AdminType)
  SELECT 'Health Admin', 'HealthAdmin', DepartmentID, 'DEPARTMENT' FROM Department WHERE Code='hlt';
INSERT OR IGNORE INTO Administrator (AdminName, UniqueID, DepartmentID, AdminType)
  SELECT 'Water and Sanitation Admin', 'WaterSanitationAdmin', DepartmentID, 'DEPARTMENT' FROM Department WHERE Code='was';
INSERT OR IGNORE INTO Administrator (AdminName, UniqueID, DepartmentID, AdminType)
  SELECT 'Public Works Admin', 'PublicWorksAdmin', DepartmentID, 'DEPARTMENT' FROM Department WHERE Code='pwi';
INSERT OR IGNORE INTO Administrator (AdminName, UniqueID, DepartmentID, AdminType)
  SELECT 'Transport Admin', 'TransportAdmin', DepartmentID, 'DEPARTMENT' FROM Department WHERE Code='trn';
INSERT OR IGNORE INTO Administrator (AdminName, UniqueID, DepartmentID, AdminType)
  SELECT 'Human Settlements Admin', 'HumanSettlementsAdmin', DepartmentID, 'DEPARTMENT' FROM Department WHERE Code='hse';
INSERT OR IGNORE INTO Administrator (AdminName, UniqueID, DepartmentID, AdminType)
  VALUES ('Municipal Manager', 'MainAdmin', NULL, 'MAIN');