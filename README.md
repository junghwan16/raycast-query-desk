# Query Desk

Run read-only MySQL and Amazon Athena queries from Raycast. Choose a connection, write SQL, sort up to 100 returned rows, and copy the rows you need as a Markdown table or a fixed-width table for Slack.

## Install from source

You need macOS, [Raycast](https://www.raycast.com/), and Node.js 22.22.2 or later.

```sh
git clone https://github.com/junghwan16/raycast-query-desk.git
cd raycast-query-desk
npm ci
npm run dev
```

Search for **Query Desk** in Raycast. **Add Connection** opens the setup form. Use the action menu to edit or delete a connection.

- **MySQL:** Set the host, port, database, user, and password. Use a MySQL 8 account with `SELECT` privileges scoped to the database you need. Choose system or custom CA verification for TLS, or choose **Off for Loopback** for a server or externally managed tunnel on your Mac. The extension does not start tunnels. For a connection check, run `SELECT 1 AS ready`.
- **Athena:** Set the AWS CLI profile, region, workgroup, catalog, and database. An SSO profile needs an active AWS CLI session. Set an S3 output location if the workgroup does not set one or use managed query results. The profile needs permission to run and stop queries in that workgroup and fetch results. Athena charges and result retention follow your AWS configuration. Start with `SELECT 1 AS ready`.

## Query and copy

1. Choose a connection and enter a single `SELECT` or a `WITH … SELECT`. Press **⌘↵** to run. The SQL editor also exposes **Run Query** through the action menu.
2. Choose **Sort by Column** to sort the returned rows. Sort the full dataset in SQL with `ORDER BY` before limiting rows.
3. Choose **Select Rows**, press Enter on the rows you want, then use **Copy Selected Rows for Slack** or **Copy Selected Rows as Markdown**. Paste the Slack version into a code block if your composer does not apply pasted backtick markup. The copied text preserves the selected rows in their on-screen order.

Use **Saved Queries** for named queries and **Recent Runs** to find the last 50 executions. Drafts are kept per connection. The connection, draft, query history, and saved SQL are stored with Raycast LocalStorage. Results are kept in memory until you leave the result view, or in the system clipboard after you copy them. Athena also retains results as configured by AWS.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
```

The Athena integration test uses the AWS SDK against a local HTTP fixture. To run the MySQL integration test, point `QUERY_DESK_TEST_MYSQL_PORT` at a local MySQL 8 test server with a `query_desk_fixture` database and a `query_desk_reader` account on loopback that has an empty password and `SELECT` permission on that database.

[MIT License](LICENSE)
