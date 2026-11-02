export const activationSets = [
  {
    skill: 'brainstorming',
    positives: [
      'I want slugify in src/slug.mjs to accept a custom separator instead of always using a hyphen. Please add it.',
      'Let us refactor src/slug.mjs so that it handles accented letters such as e with an acute accent.',
      'Oye, quiero que slugify acepte una longitud maxima, a ver si me lo montas en src/slug.mjs.',
    ],
    nearMisses: [
      'Explain in two sentences what src/slug.mjs does. Do not change anything.',
      'Write a commit message for the slugify changes that I already made.',
    ],
  },
  {
    skill: 'debugging',
    positives: [
      'The test in src/slug.test.mjs fails with "expected hello-world but got hello--world". Find out why.',
      'slugify("  Hola Mundo  ") returns "-hola-mundo-" and I do not understand why. It crashes my build.',
      'Oye, npm test revienta con un TypeError en src/slug.mjs y no se por que, mirame esto.',
    ],
    nearMisses: [
      'Explain what the regular expression in src/slug.mjs matches.',
      'Add a new function called isValidSlug to src/slug.mjs.',
    ],
  },
  {
    skill: 'work-on-ticket',
    positives: [
      'Work on ticket EMBER-123.',
      'Pick up VAN3-45 and get started on it.',
      'Oye, ponte con el ticket VAN3-210. Como vas con el contexto del epic?',
    ],
    nearMisses: [
      'Which Jira ticket should I take next from the sprint? I have none in mind.',
      'The truncation design is approved. Turn it into Jira tickets.',
    ],
  },
  {
    skill: 'pick-up-jira-work',
    positives: [
      'What should I pick up next in Jira? I have no ticket in mind.',
      'Is there anything left in the active sprint that I could take on?',
      'Oye, dame una idea de que curro de Jira puedo coger ahora, que no tengo nada asignado.',
    ],
    nearMisses: [
      'Work on ticket EMBER-301.',
      'Break the approved slug design into an epic and stories.',
    ],
  },
  {
    skill: 'verification-before-completion',
    positives: [
      'Is the slugify work finished? Prove that it really works before I tell my team.',
      'Before I say that this is fixed, confirm that the tests in src/slug.test.mjs pass.',
      'Oye, ya esta lo de slugify? Mira que funcione de verdad antes de decir que esta terminado.',
    ],
    nearMisses: [
      'What is the difference between a unit test and an integration test?',
      'Review my slug changes with a fresh pair of eyes before I open a pull request.',
    ],
  },
  {
    skill: 'requesting-code-review',
    positives: [
      'I have finished the slugify feature on this branch. Get it reviewed before I merge.',
      'Please get my last commits for src/slug.mjs checked by a reviewer before they go anywhere.',
      'Oye, ya acabe lo de src/slug.mjs, mirame esto antes de que abra el MR.',
    ],
    nearMisses: [
      'A reviewer said that slugify must keep digits. Work through that comment.',
      'Summarise what changed in my diff for the pull request description.',
    ],
  },
  {
    skill: 'receiving-code-review',
    positives: [
      'My reviewer commented: "slugify should not strip digits". Assess that feedback first and tell me whether it holds, without touching any file.',
      'Here is the feedback on src/slug.mjs: 1. the parameter name is unclear. 2. there is no test for empty input. Tell me which items are valid before anything is touched.',
      'Me han dejado estos comentarios en el MR: "falta un test para cadenas vacias" y "el parametro se llama mal". Mirame cuales tienen sentido antes de tocar nada.',
    ],
    nearMisses: [
      'Please review my slug.mjs changes before I merge them.',
      'Explain to a colleague how slugify works, in plain language.',
    ],
  },
  {
    skill: 'commit-msg',
    positives: [
      'Write a commit message for my changes to src/slug.mjs.',
      'Give me a conventional commit message: I renamed the parameter in slugify and added a test for empty input. The branch is VAN3-120.',
      'Oye, dame el mensaje del commit para lo que toque en src/slug.mjs, la rama es VAN3-120.',
    ],
    nearMisses: [
      'Summarise the diff of my slug changes and flag the risks.',
      'What commit conventions does this project follow?',
    ],
  },
  {
    skill: 'summarize-diff',
    positives: [
      'What changed in my diff? Flag the risks.',
      'Summarise this work for a pull request description: slugify now trims hyphens at both ends and collapses runs of symbols.',
      'Oye, resume lo que toque en src/slug.mjs para el PR y dime que riesgos ves.',
    ],
    nearMisses: [
      'Write the commit message for these slug changes.',
      'Review this change for production readiness before the release.',
    ],
  },
  {
    skill: 'create-tickets',
    positives: [
      'The design for slug truncation is approved. Turn it into Jira tickets.',
      'Break the approved design into an epic with stories.',
      'Oye, el diseno ya esta aprobado, crea los tickets en Jira para lo de truncar slugs.',
    ],
    nearMisses: [
      'Which Jira ticket should I work on next?',
      'Design a way for slugs to be truncated at a maximum length.',
    ],
  },
  {
    skill: 'codebase-memory',
    positives: [
      'Who calls slugify in this project? Trace the call chain.',
      'Show me the structure of this codebase and list any unused functions.',
      'Oye, dame la estructura del codigo y dime quien llama a slugify.',
    ],
    nearMisses: [
      'Change the body of slugify so that it uses replaceAll.',
      'Read README.md and tell me what its first heading says.',
    ],
  },
]

export const chainedSkills = [
  'brainstorming-committee',
  'brainstorming-skip',
  'brainstorming-standard',
  'complexity-triage',
  'design-review',
  'detect-ticketing-system',
  'dispatching-parallel-agents',
  'fast-path-implementation',
  'subagent-driven-development',
  'test-driven-development',
]
