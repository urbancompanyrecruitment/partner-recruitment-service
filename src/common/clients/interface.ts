export interface CreateLeadInput {
  phone: string;
  partnerId: string;
}

export interface CreateLeadResult {
  leadId: string;
  journeyId: string;
}

export interface OnboardingLeadResponse {
  data?: { leadId?: string; lead_id?: string; journeyId?: string; journey_id?: string };
  leadId?: string;
  lead_id?: string;
  journeyId?: string;
  journey_id?: string;
}
