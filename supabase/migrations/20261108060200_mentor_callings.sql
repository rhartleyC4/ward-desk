-- Calling discussions are confidential. A mentor acting for the new bishop sees them only when
-- the new bishop allows it (delegations.sees_callings); everyone else in the bishopric keeps
-- the access they have. can_see_callings() is has_role('bishopric') unless mentoring.
--
-- Hidden from a mentor without that permission: calling needs, the names proposed, calling
-- requests, and appointments made to extend a calling. The calling list's titles stay readable.
--
-- Additive: for anyone not mentoring can_see_callings() equals has_role('bishopric').

alter policy "bishopric manage needs" on public.calling_needs
  using (public.can_see_callings()) with check (public.can_see_callings());

alter policy "bishopric manage candidates" on public.calling_candidates
  using (public.can_see_callings()) with check (public.can_see_callings());

alter policy "bishopric read calling requests" on public.calling_requests
  using (public.can_see_callings());

alter policy "bishopric update calling requests" on public.calling_requests
  using (public.can_see_callings()) with check (public.can_see_callings());

alter policy "bishopric delete calling requests" on public.calling_requests
  using (public.can_see_callings());

alter policy "bishopric manage interviews" on public.interviews
  using (public.has_role('bishopric') and (purpose <> 'calling' or public.can_see_callings()))
  with check (public.has_role('bishopric') and (purpose <> 'calling' or public.can_see_callings()));
