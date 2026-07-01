import * as m from "./paraglide/messages.js";

export function getAuthLabels() {
  return {
    signIn: m.sign_in(),
    signOut: m.sign_out(),
    createAccount: m.create_account(),
    email: m.email_label(),
    password: m.password_label(),
    confirmPassword: m.confirm_password_label(),
    name: m.name_label(),
    submit: m.submit_button(),
    cancel: m.cancel_button(),
  };
}

export function getSettingsLabels() {
  return {
    save: m.save_button(),
    deleteAccount: m.delete_account(),
    deleteConfirm: m.delete_confirm(),
    deleteWarning: m.delete_warning(),
  };
}

export function getErrorMessages(code: 404 | 500) {
  if (code === 404) {
    return {
      title: m.error_404_title(),
      message: m.error_404_message(),
    };
  }
  return {
    title: m.error_500_title(),
    message: m.error_500_message(),
  };
}

export function getListLabels() {
  return {
    loading: m.loading(),
    noResults: m.no_results(),
    loadMore: m.load_more(),
    searchPlaceholder: m.search_placeholder(),
    filterBy: m.filter_by(),
    sortBy: m.sort_by(),
    ascending: m.ascending(),
    descending: m.descending(),
  };
}
