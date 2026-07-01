<script lang="ts">
  import * as m from '../lib/paraglide/messages.js';

  let name = 'World';
  let searchQuery = '';
  let sortOrder: 'asc' | 'desc' = 'asc';
  let isLoading = false;
  let items: string[] = [];

  function handleSearch() {
    isLoading = true;
    // fetch results...
    isLoading = false;
  }

  function toggleSort() {
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
  }
</script>

<main>
  <h1>{m.hello_world({ name })}</h1>
  <p>{m.welcome_back({ name })}</p>

  <section>
    <h2>{m.sign_in()}</h2>
    <form>
      <label>
        {m.email_label()}
        <input type="email" />
      </label>
      <label>
        {m.password_label()}
        <input type="password" />
      </label>
      <button type="submit">{m.submit_button()}</button>
      <button type="button">{m.cancel_button()}</button>
    </form>
  </section>

  <section>
    <h2>{m.create_account()}</h2>
    <form>
      <label>
        {m.name_label()}
        <input type="text" bind:value={name} />
      </label>
      <label>
        {m.email_label()}
        <input type="email" />
      </label>
      <label>
        {m.password_label()}
        <input type="password" />
      </label>
      <label>
        {m.confirm_password_label()}
        <input type="password" />
      </label>
      <button type="submit">{m.submit_button()}</button>
    </form>
  </section>

  <section>
    <input
      type="text"
      bind:value={searchQuery}
      on:input={handleSearch}
      placeholder={m.search_placeholder()}
    />

    <div>
      <span>{m.filter_by()}</span>
      <span>{m.sort_by()}</span>
      <button on:click={toggleSort}>
        {sortOrder === 'asc' ? m.ascending() : m.descending()}
      </button>
    </div>

    {#if isLoading}
      <p>{m.loading()}</p>
    {:else if items.length === 0}
      <p>{m.no_results()}</p>
    {:else}
      <ul>
        {#each items as item}
          <li>{item}</li>
        {/each}
      </ul>
      <button>{m.load_more()}</button>
    {/if}
  </section>

  <section>
    <h2>{m.delete_account()}</h2>
    <p>{m.delete_confirm()}</p>
    <p>{m.delete_warning()}</p>
    <button>{m.delete_account()}</button>
  </section>

  <section>
    <h2>{m.error_404_title()}</h2>
    <p>{m.error_404_message()}</p>
  </section>
</main>
