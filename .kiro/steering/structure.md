   # Siren: structure and ownership
   siren/
     shared/        events.ts, contracts.ts (Brain keeps them; frozen)
     decoy/         Bait
     gateway/src/   Brain (proxy, detector, stream); gateway/src/maze/ is Labyrinth
     attacker/      Labyrinth
     dashboard/     Stage
     powers/siren/  Bait
     docs/team/     Stage: playbook.md (current, wins on conflicts), guidelines.md (older)
     docs/kiro-log/ one file per role
     .kiro/         steering, specs, hooks (prefix files with your role)

   Rule: only create or edit files in the folders your role owns. If a change is needed elsewhere, stop and say which owner to ask.
   Each member has a manual steering file .kiro/steering/role-<role>.md.