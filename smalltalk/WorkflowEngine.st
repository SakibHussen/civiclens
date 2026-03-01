"============================================================
 CivicLens Report Lifecycle Workflow Engine
 GNU Smalltalk Implementation
 HenHacks — University of Delaware
 Track: Automation Systems & Public Infrastructure (Bentley Systems)
============================================================"

"------------------------------------------------------------
 Class 1: ReportStatus
 Represents a single status in the CivicLens report workflow
------------------------------------------------------------"
Object subclass: #ReportStatus
  instanceVariableNames: 'name label'
  classVariableNames: ''
  poolDictionaries: ''
  category: 'CivicLens'.

"Class-side factory methods"
ReportStatus class extend [
  pending [
    ^ self new initWithName: #pending label: 'Pending'
  ]

  inProcess [
    ^ self new initWithName: #in_process label: 'In Process'
  ]

  pendingToResolve [
    ^ self new initWithName: #pending_to_resolve label: 'Pending Resolution'
  ]

  resolved [
    ^ self new initWithName: #resolved label: 'Resolved'
  ]
]

"Instance methods"
ReportStatus extend [
  initWithName: aSymbol label: aString [
    name := aSymbol.
    label := aString.
    ^ self
  ]

  name [
    ^ name
  ]

  label [
    ^ label
  ]

  printOn: aStream [
    aStream nextPutAll: 'Status(', label, ')'
  ]
]


"------------------------------------------------------------
 Class 2: WorkflowTransition
 Represents a valid state transition between two statuses
------------------------------------------------------------"
Object subclass: #WorkflowTransition
  instanceVariableNames: 'fromStatus toStatus actor description'
  classVariableNames: ''
  poolDictionaries: ''
  category: 'CivicLens'.

WorkflowTransition extend [
  from: aStatus to: aTarget actor: anActor description: aString [
    fromStatus := aStatus.
    toStatus := aTarget.
    actor := anActor.
    description := aString.
    ^ self
  ]

  fromStatus [
    ^ fromStatus
  ]

  toStatus [
    ^ toStatus
  ]

  actor [
    ^ actor
  ]

  description [
    ^ description
  ]

  printOn: aStream [
    aStream
      nextPutAll: fromStatus label;
      nextPutAll: ' --> ';
      nextPutAll: toStatus label;
      nextPutAll: ' (by: ';
      nextPutAll: actor;
      nextPutAll: ')'
  ]
]


"------------------------------------------------------------
 Class 3: CivicWorkflowEngine
 Core state machine engine for CivicLens report lifecycle.

 Business rules enforced:
   - Only admins can move reports from pending -> in_process
   - Only admins can request resolution (in_process -> pending_to_resolve)
   - Only citizens can approve or deny a resolution
   - Admins CANNOT directly resolve reports (citizen approval is mandatory)
   - Denied reports automatically return to pending
------------------------------------------------------------"
Object subclass: #CivicWorkflowEngine
  instanceVariableNames: 'transitions'
  classVariableNames: ''
  poolDictionaries: ''
  category: 'CivicLens'.

CivicWorkflowEngine extend [
  initialize [
    "Define all valid transitions in the CivicLens workflow"
    transitions := OrderedCollection new.

    "Admin transitions"
    transitions add: (WorkflowTransition new
      from: ReportStatus pending
      to: ReportStatus inProcess
      actor: 'admin'
      description: 'Admin begins working on the report').

    transitions add: (WorkflowTransition new
      from: ReportStatus inProcess
      to: ReportStatus pendingToResolve
      actor: 'admin'
      description: 'Admin requests citizen approval for resolution').

    "Note: Admin cannot skip steps."
    "Note: Admin cannot resolve directly — citizen must approve."

    "Citizen transitions"
    transitions add: (WorkflowTransition new
      from: ReportStatus pendingToResolve
      to: ReportStatus resolved
      actor: 'citizen'
      description: 'Citizen approves the resolution').

    transitions add: (WorkflowTransition new
      from: ReportStatus pendingToResolve
      to: ReportStatus pending
      actor: 'citizen'
      description: 'Citizen denies resolution -- report returned to pending').
  ]

  canTransition: fromStatus to: toStatus by: actor [
    "Check if a transition is valid given current status, target, and actor"
    ^ transitions anySatisfy: [:t |
        (t fromStatus name = fromStatus name) and: [
        (t toStatus name = toStatus name) and: [
        t actor = actor]]]
  ]

  transition: fromStatus to: toStatus by: actor [
    "Execute a transition if valid; return a result Dictionary"
    (self canTransition: fromStatus to: toStatus by: actor)
      ifTrue: [
        | transition |
        transition := transitions detect: [:t |
          (t fromStatus name = fromStatus name) and: [
          (t toStatus name = toStatus name) and: [
          t actor = actor]]].
        ^ Dictionary new
            at: #success put: true;
            at: #from put: fromStatus label;
            at: #to put: toStatus label;
            at: #actor put: actor;
            at: #description put: transition description;
            yourself]
      ifFalse: [
        ^ Dictionary new
            at: #success put: false;
            at: #error put: ('Invalid transition: ',
              fromStatus label, ' --> ', toStatus label,
              ' by ', actor);
            yourself]
  ]

  validTransitionsFrom: aStatus by: actor [
    "Return all valid next states for a given status and actor"
    ^ transitions
        select: [:t |
          (t fromStatus name = aStatus name) and: [
          t actor = actor]]
        thenCollect: [:t | t toStatus]
  ]

  printWorkflow [
    "Print the complete workflow diagram to the Transcript"
    Transcript showCr: ''.
    Transcript showCr: 'CivicLens Report Lifecycle Workflow'.
    Transcript showCr: '==================================='.
    Transcript showCr: ''.
    Transcript showCr: 'STATES:'.
    Transcript showCr: '  [pending] --> [in_process] --> [pending_to_resolve] --> [resolved]'.
    Transcript showCr: '                                         |'.
    Transcript showCr: '                                         v'.
    Transcript showCr: '                                      [pending] (if denied)'.
    Transcript showCr: ''.
    Transcript showCr: 'VALID TRANSITIONS:'.
    transitions do: [:t |
      Transcript showCr: '  ', t printString.
      Transcript showCr: '    -> ', t description.
    ].
  ]
]


"------------------------------------------------------------
 Class 4: WorkflowDemo
 Simulates real CivicLens report lifecycle scenarios
------------------------------------------------------------"
Object subclass: #WorkflowDemo
  instanceVariableNames: ''
  classVariableNames: ''
  poolDictionaries: ''
  category: 'CivicLens'.

WorkflowDemo extend [
  run [
    | engine |
    engine := CivicWorkflowEngine new initialize.
    engine printWorkflow.

    Transcript showCr: ''.
    Transcript showCr: 'SCENARIO 1: Normal Resolution Flow'.
    Transcript showCr: '----------------------------------'.
    self runScenario1: engine.

    Transcript showCr: ''.
    Transcript showCr: 'SCENARIO 2: Citizen Denies Resolution'.
    Transcript showCr: '-------------------------------------'.
    self runScenario2: engine.

    Transcript showCr: ''.
    Transcript showCr: 'SCENARIO 3: Invalid Transition Attempt'.
    Transcript showCr: '--------------------------------------'.
    self runScenario3: engine.
  ]

  runScenario1: engine [
    "Happy path -- report gets fully resolved with citizen approval"
    | result |
    Transcript showCr: 'Report RPT-001 (Gas Leak) submitted by citizen John'.

    result := engine
      transition: ReportStatus pending
      to: ReportStatus inProcess
      by: 'admin'.
    self printResult: result.

    result := engine
      transition: ReportStatus inProcess
      to: ReportStatus pendingToResolve
      by: 'admin'.
    self printResult: result.

    result := engine
      transition: ReportStatus pendingToResolve
      to: ReportStatus resolved
      by: 'citizen'.
    self printResult: result.
    Transcript showCr: 'RPT-001 successfully resolved!'.
  ]

  runScenario2: engine [
    "Citizen denies -- report goes back to pending for rework"
    | result |
    Transcript showCr: 'Report RPT-002 (Pothole) -- citizen denies resolution'.

    result := engine
      transition: ReportStatus pending
      to: ReportStatus inProcess
      by: 'admin'.
    self printResult: result.

    result := engine
      transition: ReportStatus inProcess
      to: ReportStatus pendingToResolve
      by: 'admin'.
    self printResult: result.

    result := engine
      transition: ReportStatus pendingToResolve
      to: ReportStatus pending
      by: 'citizen'.
    self printResult: result.
    Transcript showCr: 'RPT-002 returned to pending. Reason: Issue still visible'.
  ]

  runScenario3: engine [
    "Admin attempts to resolve directly, bypassing citizen approval -- must be blocked"
    | result |
    Transcript showCr: 'Admin attempts to resolve RPT-003 directly (should fail)'.

    result := engine
      transition: ReportStatus inProcess
      to: ReportStatus resolved
      by: 'admin'.
    self printResult: result.
  ]

  printResult: aDict [
    (aDict at: #success)
      ifTrue: [
        Transcript showCr: '  + ', (aDict at: #from),
          ' --> ', (aDict at: #to),
          ' [', (aDict at: #actor), ']'.
        Transcript showCr: '    ', (aDict at: #description)]
      ifFalse: [
        Transcript showCr: '  X BLOCKED: ', (aDict at: #error)].
  ]
]


"------------------------------------------------------------
 Entry point — run the demo
------------------------------------------------------------"
WorkflowDemo new run.
