import { supabase } from '../lib/supabaseClient';

export const authService = {
  normalizeUsername(username) {
    return username.trim().toLowerCase();
  },

  isEmail(value) {
    return value.includes('@');
  },

  async resolveLoginIdentifier(identifier) {
    const normalized = identifier.trim();
    if (this.isEmail(normalized)) return normalized;

    const normalizedUsername = this.normalizeUsername(normalized);
    const { data: resolvedEmail, error: rpcError } = await supabase
      .rpc('resolve_profile_email_by_username', {
        input_username: normalizedUsername,
      });

    if (!rpcError && resolvedEmail) return resolvedEmail;

    const { data, error } = await supabase
      .from('profiles')
      .select('email')
      .ilike('username', normalizedUsername)
      .maybeSingle();

    if (error) throw error;
    if (!data?.email) throw new Error('Username not found');
    return data.email;
  },

  /**
   * Sign in with email/username and password
   * @param {string} identifier
   * @param {string} password 
   * @param {boolean} rememberMe 
   * @returns {Promise<Object>} User data or error
   */
  async signIn(identifier, password, rememberMe = true) {
    const email = await this.resolveLoginIdentifier(identifier);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    // Store remember me preference
    localStorage.setItem('fueltracker-remember-me', rememberMe ? 'true' : 'false');

    return data;
  },

  /**
   * Sign up with username, email and password
   * @param {string} username
   * @param {string} email 
   * @param {string} password 
   * @returns {Promise<Object>} User data or error
   */
  async signUp(username, email, password) {
    const normalizedUsername = this.normalizeUsername(username);
    if (!/^[a-z0-9_]{3,24}$/.test(normalizedUsername)) {
      throw new Error('Username must be 3-24 characters and use only letters, numbers, or underscores.');
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw error;

    if (data.user) {
      await this.upsertProfile(data.user.id, normalizedUsername, email);
    }

    return data;
  },

  async getProfile() {
    const user = await this.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) throw error;
    return data || {
      id: user.id,
      username: user.email?.split('@')[0] || '',
      email: user.email || '',
    };
  },

  async upsertProfile(userId, username, email) {
    const normalizedUsername = this.normalizeUsername(username);
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        username: normalizedUsername,
        email,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateUsername(username) {
    const user = await this.getUser();
    if (!user?.id || !user?.email) throw new Error('You must be logged in.');
    return this.upsertProfile(user.id, username, user.email);
  },

  async updatePassword(oldPassword, newPassword) {
    await this.verifyCurrentPassword(oldPassword);

    // Old password verified, now update to new password
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return data;
  },

  async verifyCurrentPassword(password) {
    const user = await this.getUser();
    if (!user?.email) throw new Error('You must be logged in.');

    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (error) throw new Error('Current password is incorrect.');
    return true;
  },

  async sendPasswordReset(identifier) {
    const email = await this.resolveLoginIdentifier(identifier);
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
    return data;
  },

  /**
   * Sign out the current user
   * @returns {Promise<void>}
   */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  /**
   * Get the current session
   * @returns {Promise<Object|null>} Session or null
   */
  async getSession() {
    console.log('[Auth][session] getSession start');
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error('[Auth][session] getSession error:', error);
        return null;
      }
      console.log('[Auth][session] getSession result:', session ? 'session found' : 'no session');
      return session;
    } catch (error) {
      console.error('[Auth][session] getSession exception:', error);
      return null;
    }
  },

  /**
   * Get the current user
   * @returns {Promise<Object|null>} User or null
   */
  async getUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  },

  /**
   * Listen to auth state changes
   * @param {Function} callback 
   * @returns {Object} Subscription object
   */
  onAuthStateChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Auth][session] Auth state change event:', event, session ? 'session exists' : 'no session');
        callback(event, session);
      }
    );
    return subscription;
  }
};
