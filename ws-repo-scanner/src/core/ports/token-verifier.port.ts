export interface VerifiedToken {
  uid: string;
  email: string | null;
}

export interface TokenVerifierPort {
  verify(idToken: string): Promise<VerifiedToken>;
}
