# Example API Outputs

## Archived Feature Flag

Documentation: https://docs.developers.optimizely.com/feature-experimentation/reference/archive_flags

### Request

```javascript
const url = 'https://api.optimizely.com/flags/v1/projects/<project_id>/flags/archived';
const options = {
  method: 'POST',
  headers: {
    accept: 'application/json',
    'content-type': 'application/json',
    authorization: 'Bearer <token>'
  },
  body: JSON.stringify({keys: ['<flag_key_0>', '<flag_key_1>']})
};

fetch(url, options)
  .then(res => res.json())
  .then(json => console.log(json))
  .catch(err => console.error(err));
```

### Response

```json
{
  "age_validation": {
    "key": "age_validation",
    "name": "Age Validation",
    "description": "Can we be more accurate with age verification?",
    "url": "/projects/4678434014625792/flags/age_validation",
    "delete_url": "/projects/4678434014625792/flags/age_validation",
    "unarchive_url": "/projects/4678434014625792/flags/unarchived",
    "variable_definitions": {
      "cta_button_text": {
        "key": "cta_button_text",
        "description": "",
        "type": "string",
        "default_value": "Continue",
        "created_time": "2025-05-08T16:44:36.100744Z",
        "updated_time": "2025-05-08T16:44:36.100749Z"
      },
      "input_type": {
        "key": "input_type",
        "description": "",
        "type": "string",
        "default_value": "default",
        "created_time": "2025-05-08T16:44:12.167179Z",
        "updated_time": "2025-05-08T16:44:12.167184Z"
      }
    },
    "environments": {
      "production": {
        "key": "production",
        "name": "Production",
        "enabled": false,
        "has_restricted_permissions": true,
        "priority": 1,
        "status": "paused",
        "rules_summary": {
          "a/b": {
            "keys": [
              "date_selection"
            ]
          }
        },
        "rules_detail": [
          {
            "key": "date_selection",
            "type": "a/b",
            "days_running": 80,
            "created_by_user_email": "michael.chu@optimizely.com",
            "created_time": "2025-05-08T16:48:13.267995Z",
            "traffic_allocation": 10000,
            "variation_names": [
              "Year Only",
              "Year and Month"
            ],
            "id": 1434849,
            "name": "Date Selection",
            "layer_experiment_id": 9300002397982,
            "distribution_mode": "manual",
            "updated_time": "2025-07-28T16:44:09.672706Z",
            "primary_metric": "Time To Dialog Dismiss",
            "status": "running",
            "enabled": true,
            "fetch_results_ui_url": "https://app.optimizely.com/v2/projects/4678434014625792/results/9300001677421/experiments/9300002397982",
            "audience_ids": []
          }
        ],
        "id": 101746715916459,
        "enable_url": "/projects/4678434014625792/flags/age_validation/environments/production/ruleset/enabled",
        "created_time": "2025-05-08T14:51:56.000000Z"
      },
      "development": {
        "key": "development",
        "name": "Development",
        "enabled": false,
        "has_restricted_permissions": false,
        "priority": 2,
        "status": "draft",
        "rules_summary": {},
        "rules_detail": [],
        "id": 361746715916479,
        "enable_url": "/projects/4678434014625792/flags/age_validation/environments/development/ruleset/enabled",
        "created_time": "2025-05-08T14:51:56.000000Z"
      }
    },
    "id": 415337,
    "urn": "flags.flags.optimizely.com::415337",
    "archived": true,
    "outlier_filtering_enabled": false,
    "project_id": 4678434014625792,
    "created_by_user_id": "michael.chu@optimizely.com",
    "created_by_user_email": "michael.chu@optimizely.com",
    "account_id": 21468570738,
    "role": "admin",
    "created_time": "2025-05-08T16:31:57.402712Z",
    "updated_time": "2025-07-28T16:44:09.647558Z",
    "revision": 5
  }
}
```

## List Feature Flags

Documentation: https://docs.developers.optimizely.com/feature-experimentation/reference/list_flags

### Request

```javascript
const url = 'https://api.optimizely.com/flags/v1/projects/<project_id>/flags';
const options = {
  method: 'GET',
  headers: {
    accept: 'application/json',
    authorization: 'Bearer <token>'
  }
};

fetch(url, options)
  .then(res => res.json())
  .then(json => console.log(json))
  .catch(err => console.error(err));
```

### Response

```json
{
  "url": "/projects/4678434014625792/flags",
  "fetch_flag_url": "/projects/4678434014625792/flags/{flag_key}",
  "items": [
    {
      "key": "age_validation",
      "name": "Age Validation",
      "description": "Can we be more accurate with age verification?",
      "url": "/projects/4678434014625792/flags/age_validation",
      "update_url": "/projects/4678434014625792/flags",
      "delete_url": "/projects/4678434014625792/flags/age_validation",
      "archive_url": "/projects/4678434014625792/flags/archived",
      "variable_definitions": {
        "cta_button_text": {
          "key": "cta_button_text",
          "description": "",
          "type": "string",
          "default_value": "Continue",
          "created_time": "2025-05-08T16:44:36.100744Z",
          "updated_time": "2025-05-08T16:44:36.100749Z"
        },
        "input_type": {
          "key": "input_type",
          "description": "",
          "type": "string",
          "default_value": "default",
          "created_time": "2025-05-08T16:44:12.167179Z",
          "updated_time": "2025-05-08T16:44:12.167184Z"
        }
      },
      "environments": {
        "production": {
          "key": "production",
          "name": "Production",
          "enabled": true,
          "has_restricted_permissions": true,
          "priority": 1,
          "status": "running",
          "rules_summary": {
            "a/b": {
              "keys": [
                "date_selection"
              ]
            }
          },
          "rules_detail": [
            {
              "variation_names": [
                "Year Only",
                "Year and Month"
              ],
              "name": "Date Selection",
              "audience_ids": [],
              "primary_metric": "Time To Dialog Dismiss",
              "traffic_allocation": 10000,
              "distribution_mode": "manual",
              "created_time": "2025-05-08T16:48:13.267995Z",
              "fetch_results_ui_url": "https://app.optimizely.com/v2/projects/4678434014625792/results/9300001677421/experiments/9300002397982",
              "updated_time": "2025-05-12T20:23:41.018267Z",
              "enabled": true,
              "created_by_user_email": "michael.chu@optimizely.com",
              "layer_experiment_id": 9300002397982,
              "status": "running",
              "days_running": 80,
              "type": "a/b",
              "key": "date_selection",
              "id": 1434849
            }
          ],
          "id": 101746715916459,
          "disable_url": "/projects/4678434014625792/flags/age_validation/environments/production/ruleset/disabled",
          "created_time": "2025-05-08T14:51:56.000000Z"
        },
        "development": {
          "key": "development",
          "name": "Development",
          "enabled": false,
          "has_restricted_permissions": false,
          "priority": 2,
          "status": "draft",
          "rules_summary": {},
          "rules_detail": [],
          "id": 361746715916479,
          "enable_url": "/projects/4678434014625792/flags/age_validation/environments/development/ruleset/enabled",
          "created_time": "2025-05-08T14:51:56.000000Z"
        }
      },
      "id": 415337,
      "urn": "flags.flags.optimizely.com::415337",
      "archived": false,
      "outlier_filtering_enabled": false,
      "project_id": 4678434014625792,
      "created_by_user_id": "michael.chu@optimizely.com",
      "created_by_user_email": "michael.chu@optimizely.com",
      "account_id": 21468570738,
      "role": "admin",
      "created_time": "2025-05-08T16:31:57.402712Z",
      "updated_time": "2025-05-12T20:23:40.825440Z",
      "revision": 4
    }
  ],
  "create_url": "/projects/4678434014625792/flags",
  "last_url": "/projects/4678434014625792/flags",
  "count": 1,
  "total_pages": 1,
  "first_url": "/projects/4678434014625792/flags",
  "total_count": 1,
  "page": 1
}
```

## Fetch a Single Flag

Documentation: https://docs.developers.optimizely.com/feature-experimentation/reference/fetch_flag

### Request

```javascript
const url = 'https://api.optimizely.com/flags/v1/projects/<project_id>/flags/age_validation';
const options = {
  method: 'GET',
  headers: {
    accept: 'application/json',
    authorization: 'Bearer <token>'
  }
};

fetch(url, options)
  .then(res => res.json())
  .then(json => console.log(json))
  .catch(err => console.error(err));
```

### Response

```json
{
  "key": "age_validation",
  "name": "Age Validation",
  "description": "Can we be more accurate with age verification?",
  "url": "/projects/4678434014625792/flags/age_validation",
  "update_url": "/projects/4678434014625792/flags",
  "delete_url": "/projects/4678434014625792/flags/age_validation",
  "archive_url": "/projects/4678434014625792/flags/archived",
  "variable_definitions": {
    "cta_button_text": {
      "key": "cta_button_text",
      "description": "",
      "type": "string",
      "default_value": "Continue",
      "created_time": "2025-05-08T16:44:36.100744Z",
      "updated_time": "2025-05-08T16:44:36.100749Z"
    },
    "input_type": {
      "key": "input_type",
      "description": "",
      "type": "string",
      "default_value": "default",
      "created_time": "2025-05-08T16:44:12.167179Z",
      "updated_time": "2025-05-08T16:44:12.167184Z"
    }
  },
  "environments": {
    "production": {
      "key": "production",
      "name": "Production",
      "enabled": true,
      "has_restricted_permissions": true,
      "priority": 1,
      "status": "running",
      "rules_summary": {
        "a/b": {
          "keys": [
            "date_selection"
          ]
        }
      },
      "rules_detail": [
        {
          "created_by_user_email": "michael.chu@optimizely.com",
          "variation_names": [
            "Year Only",
            "Year and Month"
          ],
          "type": "a/b",
          "layer_experiment_id": 9300002397982,
          "status": "running",
          "days_running": 80,
          "key": "date_selection",
          "name": "Date Selection",
          "fetch_results_ui_url": "https://app.optimizely.com/v2/projects/4678434014625792/results/9300001677421/experiments/9300002397982",
          "updated_time": "2025-05-12T20:23:41.018267Z",
          "id": 1434849,
          "traffic_allocation": 10000,
          "primary_metric": "Time To Dialog Dismiss",
          "distribution_mode": "manual",
          "enabled": true,
          "created_time": "2025-05-08T16:48:13.267995Z",
          "audience_ids": []
        }
      ],
      "id": 101746715916459,
      "disable_url": "/projects/4678434014625792/flags/age_validation/environments/production/ruleset/disabled",
      "created_time": "2025-05-08T14:51:56.000000Z"
    },
    "development": {
      "key": "development",
      "name": "Development",
      "enabled": false,
      "has_restricted_permissions": false,
      "priority": 2,
      "status": "draft",
      "rules_summary": {},
      "rules_detail": [],
      "id": 361746715916479,
      "enable_url": "/projects/4678434014625792/flags/age_validation/environments/development/ruleset/enabled",
      "created_time": "2025-05-08T14:51:56.000000Z"
    }
  },
  "id": 415337,
  "urn": "flags.flags.optimizely.com::415337",
  "archived": false,
  "outlier_filtering_enabled": false,
  "project_id": 4678434014625792,
  "created_by_user_id": "michael.chu@optimizely.com",
  "created_by_user_email": "michael.chu@optimizely.com",
  "account_id": 21468570738,
  "role": "admin",
  "created_time": "2025-05-08T16:31:57.402712Z",
  "updated_time": "2025-05-12T20:23:40.825440Z",
  "revision": 4
}
```

## List Environments

Documentation: https://docs.developers.optimizely.com/feature-experimentation/reference/list_environments-feature-experimentation

### Request

```javascript
const url = 'https://api.optimizely.com/flags/v1/projects/<project_id>/environments';
const options = {
  method: 'GET',
  headers: {
    accept: 'application/json',
    authorization: 'Bearer <token>'
  }
};

fetch(url, options)
  .then(res => res.json())
  .then(json => console.log(json))
  .catch(err => console.error(err));
```

### Response

```json
{
  "url": "/projects/4678434014625792/environments",
  "items": [
    {
      "key": "production",
      "name": "Production",
      "archived": false,
      "priority": 1,
      "account_id": 21468570738,
      "project_id": 4678434014625792,
      "role": "admin",
      "id": 101746715916459,
      "has_restricted_permissions": true
    },
    {
      "key": "development",
      "name": "Development",
      "archived": false,
      "priority": 2,
      "account_id": 21468570738,
      "project_id": 4678434014625792,
      "role": "admin",
      "id": 361746715916479,
      "has_restricted_permissions": false
    }
  ],
  "page": 1,
  "last_url": "/projects/4678434014625792/environments",
  "total_count": 2,
  "total_pages": 1,
  "first_url": "/projects/4678434014625792/environments",
  "count": 2
}
```