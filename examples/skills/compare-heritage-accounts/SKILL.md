---
name: Compare Heritage Accounts
description: Compare the extracted details of two or more heritage accounts. Use after
  extraction, and distinguish agreement from differences without erasing source attribution.
inputs:
- name: accounts
  description: Accepted extraction outputs from every required account
  required: true
outputs:
- Agreement
- Differences with source attribution
- Supplied source references
---

Wait for all required account extractions. Compare the current accounts field by field. Report Agreement and Differences separately. Attribute each differing detail to its supplied source reference. Preserve uncertainties, and distinguish absence of information from a contradiction. Do not treat fictional classroom excerpts as historical evidence.
