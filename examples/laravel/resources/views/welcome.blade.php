<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ __('Welcome') }}</title>
</head>
<body>
    <div>
        <h1>{{ __('Welcome') }}</h1>
        <p>{{ __('auth.login') }}</p>

        @if(auth()->check())
            <a href="/dashboard">{{ __('Dashboard') }}</a>
            <a href="/profile">{{ __('Profile') }}</a>
            <a href="/settings">{{ __('Settings') }}</a>
            <form method="POST" action="/logout">
                @csrf
                <button type="submit">{{ __('Log out') }}</button>
            </form>
        @else
            <a href="/login">{{ __('auth.login') }}</a>
            <a href="/register">{{ __('auth.register') }}</a>
        @endif
    </div>

    <div>
        <h2>@lang('Settings')</h2>
        <form method="POST" action="/settings">
            @csrf
            <label>{{ __('Name') }}</label>
            <input type="text" name="name" value="{{ old('name') }}">

            <label>{{ __('Email address') }}</label>
            <input type="email" name="email" value="{{ old('email') }}">

            <label>{{ __('Password') }}</label>
            <input type="password" name="password">

            <label>{{ __('Confirm password') }}</label>
            <input type="password" name="password_confirmation">

            <label>
                <input type="checkbox" name="remember" {{ old('remember') ? 'checked' : '' }}>
                {{ __('Remember me') }}
            </label>

            <button type="submit">{{ __('Save changes') }}</button>
            <a href="/">{{ __('Cancel') }}</a>
        </form>
    </div>

    <div>
        <h2>{{ __('Delete account') }}</h2>
        <p>{{ __('Are you sure?') }}</p>
        <p>{{ __('This action cannot be undone.') }}</p>
        <form method="POST" action="/account/delete">
            @csrf
            @method('DELETE')
            <button type="submit">{{ __('Delete account') }}</button>
        </form>
    </div>
</body>
</html>
