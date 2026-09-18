# Research brief: inbound booking calls (CSR script, training, scorecard)

> Desk research, 2026-09-18. Labels: **[D]** data-backed (source cited; "vendor" = publisher sells related product) · **[E]** expert/practitioner consensus · **[I]** inference.
> Main gap: no published locksmith-specific call benchmarks exist (Invoca covers 9 trades, none locksmith; ServiceTitan covers plumbing/HVAC/electrical/garage door). "Callers dial 2–4 locksmiths" is the owner's observation, not a measured stat.

## 1. Metrics: booking rate, answer speed, missed calls

**Booking rate definition**
- [D, vendor] ServiceTitan: booked jobs ÷ "call leads" (inbound call ≥60 s or flagged "Is Lead"); unbooked calls can be marked "Excused" [2][3].
- [E] Remove non-opportunity calls from the denominator: wrong numbers, vendors, duplicates, job-status calls, out-of-area, services not offered [4].
- [I] TrustKey definition: **booked jobs ÷ opportunity calls** (needs a service we offer, in our area). Report emergency vs non-urgent separately. Log a reason code on every unbooked call: price / ETA / just shopping / got in on their own / out of area.

**Benchmarks**
- [D, vendor] ServiceTitan (3,000+ businesses, June 2022): typical booking rate **42%** (plumbing 43, electrical 41, HVAC 38, garage door 31). Shops with <5 techs **24%**, 25+ techs **59%** [1].
- [D, vendor] Invoca 2026: 52% of callers reached a person; 45% of leads converted on the call; **55% of home-services businesses never asked the lead to book**. Call handling: proper greeting 81%, caller info captured 62%, asked for appointment 45%, proper closing 72% [5][6].
- [E, self-reported] Coaches claim trained CSRs book 85–90%+ (Power Selling Pros [7]; Angie Snow ">90%" [8]; Tommy Mello: average 43%, A1 Garage 87% [49]).
- Untraceable — don't use: "ServiceTitan benchmark 65–75% / 85% top", "emergency calls book 85–95%".
- [I] Run 4 weeks of baseline before setting a target.

**Answer speed & missed calls**
- [D] Contact-center "80/20" (80% answered in 20 s) is a convention (ICMI lists 80/30, 90/60 too) [9].
- [D] Google Local Services Ads: "missed calls may negatively affect your responsiveness" (ranking factor) [10].
- [D, vendor] Invoca: 27% of home-services calls go unanswered; <3% of callers sent to voicemail leave a message [11].
- [D, weak] "62% unanswered" = 411 Locals 2016, 85 businesses, 30 days [12].
- **Untraceable — keep out of training:** "85% won't call back", "62/67% call a competitor", "78% buy from first responder", "7 in 10 hang up after 3rd ring" [13][14].
- [D, web leads] HBR 2011 (2,241 firms): average web-lead response 42 h; replying within 1 h ≈7× more likely to qualify [15].
- [I] Targets: answer by ring 2–3 (<15 s); no voicemail during open hours.

## 2. Call structure, length, control

- [E] ServiceTitan order: Opening → Discovery (problem, then customer details) → Setting expectations → Read-back ("we will see you at ADDRESS, DAY TIME to JOB TYPE") [16][17].
- [E] Angie Snow: asking more questions = "secret weapon" — answer the question, then ask one back [8].
- [D, B2B] Gong (326,000+ calls): won deals — rep talked 57%, asked 15–16 questions; lost — 62%, ~20 questions. Purposeful questions win, interrogation loses [18].
- [D] No credible published call-length target. [I] Rough: emergency lockout 2–4 min; non-urgent 4–8 min. Diagnostic, never a quota.

**Proposed locksmith flow** [I]
1. Greeting (<5 s): "TrustKey Locksmith, this is [Name]. Are you locked out, or do you need keys?" (BBB: a generic "locksmith services" greeting is a red flag [20][26].)
2. Safety: child/pet in car → "Call 911 now." (NHTSA [21]; ARS 12-558.02 requires notifying first responders before forcing entry [22].)
3. Location + callback number early (call may drop).
4. 2–4 qualifying questions by job type.
5. Price. 6. Honest ETA window. 7. Close by asking for the address.
8. ID/proof of ownership on arrival (standard practice [23]).
9. Read-back + confirmation text.

## 3. "How much does it cost?"

- [E] HVAC coaches: hold price, diagnose first (Angie Snow; Power Selling Pros). Never "we don't have pricing in the office" [8][24]. Fits trades where the price is genuinely unknown.
- [D] Consumer agencies coach locksmith callers to **demand the full price on the phone**: Connecticut DCP 2026 [25]; BBB — "$25 phone quotes swelling to $350", "if onsite estimate doesn't match the phone estimate, don't allow the job" [26][20]; California DCA [27]. **For a locksmith, dodging the price sounds like the scam callers are warned about.**
- [D] Price transparency research: Mohan, Buell & John 2020 (Marketing Science) — voluntarily showing costs raised purchase interest >20% via trust [28]; Santana, Dallas & Morwitz — upfront surcharges → higher satisfaction [29]; StubHub hidden fees +21% spend short-term = why regulators call it deceptive [30].
- [I] **"Answer, Anchor, Ask":** (1) at most one fact question first, only if price depends on it; (2) full out-the-door price in one breath + what's included + the one thing that could change it; (3) immediately a question that moves the call forward. Never lowball; don't criticize others.

## 4. Stressed callers

- [E] Black Swan (Chris Voss): labels ("It sounds like…"), "late-night FM DJ voice" (low, slow, downward), accusation audit [31][32].
- [D, lab] Lieberman 2007: naming an emotion reduced amygdala activity [33][34] — plausible on phone, not proven.
- [E] Avoid "I understand", reflexive "I'm sorry", "At least…". Use "That sounds so frustrating" / "This happened at the worst time" [24].
- [D] Packard & Berger 2021 (JCR, 1,000+ real interactions): **concrete** language raised satisfaction and purchases [35]. "Marcus is about 25 minutes out, white van" > "someone will be there soon".
- [I] One label + one reassurance + action within ~10 s.

## 5. Closing, confirmation, cancellations

- [D, vendor] Only ~45% of home-services calls include a request to book [6]. Just asking is a big lever.
- [E] Assumptive close is standard (untested in controlled studies). [I] Emergency: "What's the exact address?" Non-urgent: choice — "Today after 3, or tomorrow morning?"
- [E] Read back name, address, job, time [16].
- [D, vendor survey] Housecall Pro (1,040 homeowners, Oct 2025): ~60% appreciate tech name + photo before the visit [36].
- [D, healthcare] Cochrane (8 RCTs, 6,615 people): SMS reminders improve attendance (RR 1.14) [38].
- [I] Emergency risk = caller gets in another way or books whoever arrives first. Counter: honest ETA window, text within 60 s (tech name/photo/price), proactive late update.

## 6. Words to avoid

- [D] Erickson 1978: "powerless" speech (hedges, hesitations, rising intonation) → less credible [39].
- [D] Packard, Moore & McFerran 2018 (JMR): agents saying **"I"** (not "we") seen as more empathetic and agentic → higher satisfaction and purchases [40].
- [E] Effortless Experience: talk about what you *can* do [41].

| Avoid | Use instead |
|---|---|
| "I think / maybe / probably around…" | "It's $X total." |
| "We'll try to get someone out" | "I'm sending [Name]; he's about 30–45 minutes out." |
| "It's our policy" | "To protect you, the tech checks ID before opening." |
| "Unfortunately we can't…" | "What I can do is…" |
| "I understand" / "At least…" | "That sounds stressful." |
| "I'm just the dispatcher" / "Don't have pricing" | "I can give you that price right now." |
| "Do you want us to come out?" | "What's the exact address?" |

## 7. Missed-call text-back & follow-ups

- Evidence thin. [D, vendor] <3% leave voicemail [11]. [D] Oldroyd 2007: contact odds 100× higher within 5 min vs 30 (contact, not sales) [13]. Vendor claims "30–60% recovered", "98% open rate" — no primary source.
- [D] TCPA: solicitations barred before 8 a.m./after 9 p.m. local; texts = calls [43]. 10DLC registration + consent for marketing texts [44].
- [I] Templates: missed call (auto, <60 s): "Hi, this is TrustKey Locksmith. We missed your call. Locked out or need keys? Reply here or call [number]." · Quoted-not-booked (human, 10–15 min): "Hi [Name], it's [CSR] at TrustKey. Still locked out? Your price is still $X and [Tech] can be there in about 25–35 min. Reply YES and I'll send him." · Non-urgent next day: "Have you given up on getting that spare key made?" · Max 2 texts emergency / 3 non-urgent; stop at "got in", "no", STOP.

## 8. Training from zero

- [D] Taylor, Russ-Eft & Chan 2005 (117 studies): transfer best with **good AND bad examples**, scenarios trainees help write, goal-setting, trained supervisors, rewarded behavior; key points as short rules; longer training [46].
- [D] Liu & Batt 2010: monthly coaching amount predicted performance gains [47].
- [D] Brynjolfsson, Li & Raymond 2025 (QJE, 5,179 agents): AI assistant +14% productivity, **+34% for novices**, by spreading top performers' practices [48]. [I] Top-performer phrasing in a script/cheat sheet helps new hires most.
- [E] Weekly 1:1s + recorded-call review (ServiceTitan) [1]; CSR booking rate tracked and tied to pay (Mello) [19][49]; repetition incl. role-play of price questions and complaints (Snow) [8].
- [I] Program: Days 1–3 knowledge · Days 3–7 role-play 2×45 min/day, ~15 scenarios, with good/bad recordings · Days 5–10 listen-in, then supervised calls · **Certification:** 100% price/area quiz; 10 graded role-plays ≥85% no critical fails; 10 supervised live calls no critical fails · After live: daily 10-min warm-up for 30 days; 5 scored calls/week + every unbooked opportunity call; weekly 20-min 1:1 (one strength, one fix); monthly calibration (owner + manager score the same call).

## Top 12 rules
1. Answer by ring 2–3: "TrustKey Locksmith, this is [Name]."
2. Safety first: child/pet in car → 911 now, then dispatch.
3. Location + callback number early.
4. Answer one question → ask one. Whoever asks leads.
5. Full out-the-door price, confident, what's in it and what could change it. Never lowball or dodge.
6. End every answer with a question that moves the call forward.
7. Honest ETA window, never the most optimistic.
8. Label once ("That sounds stressful"), then act. Low, slow, steady.
9. Concrete, "I": "I'm sending Marcus, 25–35 minutes."
10. Ask for the job: "What's the exact address?"
11. Read back name, address, job, price, ETA; ID reminder; confirmation text.
12. No claim outside the approved list; reason code for every unbooked call.

## Draft scorecard (0/1/2 each; ★ = critical fail)
1. Answer & greeting (≤15 s, company + own name)
2. ★ Safety check when applicable
3. Location + callback number early
4. Discovery: right 2–4 questions, no interrogation
5. ★ Price: accurate, full, no hedging; what's included / what could change
6. ETA: honest, specific window
7. ★ Asked for the booking (assumptive / choice close)
8. Empathy & tone: one label, calm pace, no banned phrases
9. Call control: led with questions, handled objections, asked again
10. Confirmation: read-back, ID requirement, confirmation text
11. ★ Honesty: no unverified claims, no promises tech can't keep
12. Wrap-up: outcome + reason code logged; follow-up queued if not booked

## Sources
1. https://www.servicetitan.com/blog/data-call-booking-rates
2. https://help.servicetitan.com/docs/dashboard-call-metrics
3. https://help.servicetitan.com/v1/docs/review-calls-in-the-call-metrics-scoreboard
4. https://homeservicescorecard.com/articles/hvac-csr-kpis/
5. https://www.invoca.com/reports/the-invoca-home-services-lead-conversion-benchmarks-report-2026
6. https://www.invoca.com/blog/5-insights-60-million-phone-conversations
7. https://powersellingpros.com/
8. https://www.servicetitan.com/blog/webinar-recap-angie-snow-csr
9. https://www.bradcleveland.com/wp-content/uploads/2022/10/eBook-metrics.pdf
10. https://support.google.com/localservices/answer/7527305?hl=en
11. https://www.invoca.com/blog/how-much-missed-sales-calls-cost-home-services-businesses
12. https://411locals.us/small-business-owners-dont-answer-62-of-phone-calls/
13. https://www.expertise.ai/stats/speed-to-lead-statistics
14. https://www.hicira.com/missed-call-statistics
15. https://hbr.org/2011/03/the-short-life-of-online-sales-leads
16. https://www.servicetitan.com/field-service-management/call-scripts
17. https://www.servicetitan.com/field-service-management/required-information
18. https://www.gong.io/resources/labs/talk-to-listen-conversion-ratio/
19. https://www.servicetitan.com/blog/webinar-recap-maximize-your-leads-with-tommy-mello
20. https://www.bbb.org/article/news-releases/22797-bbb-scam-alert-locked-out-dont-fall-for-a-locksmith-cons
21. https://www.nhtsa.gov/child-safety/you-can-help-prevent-hot-car-deaths
22. https://codes.findlaw.com/az/title-12-courts-and-civil-proceedings/az-rev-st-sect-12-558-02/
23. https://alphalocksmith.com/alpha-locksmiths-positive-id-policy-for-lockout-services-and-keys-to-code/
24. https://servicebusinessmastery.com/608-things-you-should-never-say-to-your-customers-customer-service-insights-from-erica-leonor-of-power-selling-pros/
25. https://portal.ct.gov/dcp/news-releases-from-the-department-of-consumer-protection/2026-news-releases/be-wary-of-scammers-posing-as-locksmith-technicians
26. https://www.wisbusiness.com/2014/wisconsin-better-business-bureau-bbbs-8-tips-to-avoid-locksmith-scams/
27. https://www.dca.ca.gov/publications/locksmith_tips.shtml
28. https://pubsonline.informs.org/doi/10.1287/mksc.2019.1200
29. https://faculty.tuck.dartmouth.edu/images/uploads/faculty/nemc/Santana_Dallas_Morwitz_Drip_Pricing.pdf
30. https://vcresearch.berkeley.edu/news/buyer-beware-massive-experiment-shows-why-ticket-sellers-hit-you-last-second-fees
31. https://www.blackswanltd.com/the-edge/how-to-use-fbi-empathy
32. https://www.blackswanltd.com/newsletter/expert-negotiator-concepts-that-have-evolved-since-never-split-the-difference-was-published
33. https://sanlab.psych.ucla.edu/wp-content/uploads/sites/31/2015/05/Lieberman_AL-2007.pdf
34. https://www.uclahealth.org/news/release/putting-feelings-into-words-produces-therapeutic-effects-in-the-brain-ucla-neuroimaging-study-supports-ancient-buddhist-teachings
35. https://academic.oup.com/jcr/article/47/5/787/5873524
36. https://www.housecallpro.com/resources/home-service-customer-service-report-trends-statistics/
37. https://www.servicetitan.com/blog/employee-biographies
38. https://www.cochrane.org/evidence/CD007458_mobile-phone-messaging-reminders-attendance-healthcare-appointments
39. https://www.sciencedirect.com/science/article/abs/pii/002210317890015X
40. https://journals.sagepub.com/doi/10.1509/jmr.16.0118
41. https://www.nicereply.com/blog/customer-experience-skills/
42. https://www.twilio.com/en-us/press/releases/twilio-study-finds-that-9-out-of-10-consumers-globally-want-to-message-with-brands
43. https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200
44. https://www.faegredrinker.com/en/insights/publications/2025/6/launching-text-campaigns-ins-outs-of-10dlc-registration
45. https://www.blackswanltd.com/newsletter/the-magic-label-have-you-given-up-on-_____
46. https://pubmed.ncbi.nlm.nih.gov/16060787/
47. https://onlinelibrary.wiley.com/doi/10.1111/j.1744-6570.2010.01170.x
48. https://academic.oup.com/qje/article/140/2/889/7990658
49. https://www.handymanstartup.com/grow-garage-door-company-tommy-mello/
50. https://www.smartrole.ai/blog/call-center-nesting-period-best-practices
