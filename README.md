# CivicLens
Newark's AI-Powered Civic Intelligence Platform

## What is CivicLens?
CivicLens bridges the gap between Newark citizens and city departments
through real-time AI-powered infrastructure issue reporting and resolution.

Citizens report issues via photo + location. Gemini Vision AI analyzes
the image, identifies the issue type, assigns it to the correct department
(Fire, Water, Public Works), and posts it to a community chat. Departments
manage resolution through a structured approval workflow.

## Tech Stack
- React + Vite (Frontend)
- Firebase Firestore + Auth (Real-time backend)
- Google Gemini Vision AI (Image analysis + issue classification)
- Progressive Web App (Installable on iOS + Android)
- GNU Smalltalk (Workflow engine — see below)

## Team
- Built at HenHacks, University of Delaware
- Track: Automation Systems & Public Infrastructure (Bentley Systems)

---

## LabWare Smalltalk Mini Category

### How Smalltalk Was Used
CivicLens implements its **report lifecycle workflow engine** in GNU Smalltalk.

The Smalltalk module models the complete state machine that governs how
infrastructure reports move through the resolution process — from initial
citizen submission through department action to final citizen approval.

This workflow engine enforces the core business rules of CivicLens:
- Only admins can move reports from pending → in process
- Only admins can request resolution (in process → pending resolution)
- Only the original citizen can approve or deny a resolution
- Admins **cannot** directly resolve reports — citizen approval is mandatory
- Denied reports automatically return to pending with explanation

These same rules are enforced in the React application via Firebase
security logic. The Smalltalk implementation proves these rules as a
formal, executable specification — a practice used in enterprise
municipal software systems.

### Why Smalltalk for This?
Smalltalk's message-passing object model is architecturally ideal for
workflow state machines. Each status transition is a message sent between
objects, mirroring exactly how Smalltalk was designed to work. This is
not a toy example — Smalltalk powers real government and municipal
software systems worldwide (including LabWare LIMS itself).

### Smalltalk Files
- `smalltalk/WorkflowEngine.st` — Complete workflow engine
  - `ReportStatus` — Status value object
  - `WorkflowTransition` — Valid transition definition
  - `CivicWorkflowEngine` — Core state machine with transition validation
  - `WorkflowDemo` — 3 realistic scenarios demonstrating the engine

### Running the Smalltalk Code
Install GNU Smalltalk:
```
Mac:    brew install gnu-smalltalk
Ubuntu: sudo apt-get install gnu-smalltalk
```

Run:
```
gst smalltalk/WorkflowEngine.st
```

### Expected Output
```
CivicLens Report Lifecycle Workflow
===================================
STATES:
  [pending] --> [in_process] --> [pending_to_resolve] --> [resolved]
                                         |
                                         v
                                      [pending] (if denied)

VALID TRANSITIONS:
  Pending --> In Process (by: admin)
    -> Admin begins working on the report
  In Process --> Pending Resolution (by: admin)
    -> Admin requests citizen approval for resolution
  Pending Resolution --> Resolved (by: citizen)
    -> Citizen approves the resolution
  Pending Resolution --> Pending (by: citizen)
    -> Citizen denies resolution -- report returned to pending

SCENARIO 1: Normal Resolution Flow
----------------------------------
Report RPT-001 (Gas Leak) submitted by citizen John
  + Pending --> In Process [admin]
    Admin begins working on the report
  + In Process --> Pending Resolution [admin]
    Admin requests citizen approval for resolution
  + Pending Resolution --> Resolved [citizen]
    Citizen approves the resolution
RPT-001 successfully resolved!

SCENARIO 2: Citizen Denies Resolution
-------------------------------------
Report RPT-002 (Pothole) -- citizen denies resolution
  + Pending --> In Process [admin]
    Admin begins working on the report
  + In Process --> Pending Resolution [admin]
    Admin requests citizen approval for resolution
  + Pending Resolution --> Pending [citizen]
    Citizen denies resolution -- report returned to pending
RPT-002 returned to pending. Reason: Issue still visible

SCENARIO 3: Invalid Transition Attempt
--------------------------------------
Admin attempts to resolve RPT-003 directly (should fail)
  X BLOCKED: Invalid transition: In Process --> Resolved by admin
```
