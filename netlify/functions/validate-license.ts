import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions"

interface ValidateRequest {
  key: string
}

interface ValidateResponse {
  valid: boolean
  error?: string
}

/**
 * Get CORS headers for all responses
 */
function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400", // 24 hours
  }
}

/**
 * Netlify serverless function to validate LemonSqueezy license keys
 * 
 * Environment variables required:
 * - LEMONSQUEEZY_API_KEY: Your LemonSqueezy API key
 * 
 * Usage:
 * POST /api/validate-license
 * Body: { "key": "license-key-here" }
 * Response: { "valid": true } or { "valid": false, "error": "message" }
 */
export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
): Promise<{ statusCode: number; body: string; headers?: Record<string, string> }> => {
  const corsHeaders = getCorsHeaders()

  // Handle CORS preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    }
  }

  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ valid: false, error: "Method not allowed" }),
    }
  }

  // Get API key from environment variables
  const apiKey = process.env.LEMONSQUEEZY_API_KEY
  if (!apiKey) {
    console.error("LEMONSQUEEZY_API_KEY environment variable is not set")
    return {
      statusCode: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ valid: false, error: "Server configuration error" }),
    }
  }

  try {
    // Parse request body
    const body: ValidateRequest = JSON.parse(event.body || "{}")
    const licenseKey = body.key?.trim()

    if (!licenseKey) {
      return {
        statusCode: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ valid: false, error: "License key is required" }),
      }
    }

    // Validate license key with LemonSqueezy API
    console.log("Validating license key:", licenseKey.substring(0, 8) + "...")
    
    const response = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/vnd.api+json",
      },
      body: JSON.stringify({
        license_key: licenseKey,
      }),
    })

    console.log("LemonSqueezy API response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("LemonSqueezy API error:", response.status, errorText)
      
      // Handle different error cases
      if (response.status === 401) {
        return {
          statusCode: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ valid: false, error: "Authentication failed" }),
        }
      }
      
      if (response.status === 404) {
        // License key not found
        return {
          statusCode: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ valid: false }),
        }
      }

      // Other errors - return error details for debugging
      return {
        statusCode: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          valid: false, 
          error: `Validation service error (${response.status}): ${errorText.substring(0, 100)}` 
        }),
      }
    }

    let data
    try {
      const responseText = await response.text()
      console.log("LemonSqueezy API raw response:", responseText.substring(0, 500))
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error("Failed to parse LemonSqueezy response:", parseError)
      return {
        statusCode: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          valid: false, 
          error: "Invalid response from validation service" 
        }),
      }
    }

    console.log("LemonSqueezy API parsed response:", JSON.stringify(data).substring(0, 500))

    // LemonSqueezy returns { valid: true/false } in the response
    // Inactive licenses still return valid: true (inactive just means no activations yet)
    // The response may also include license_key object with status: "inactive"
    const isValid = data.valid === true

    console.log("License validation result:", isValid ? "VALID" : "INVALID")

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ valid: isValid } as ValidateResponse),
    }
  } catch (error) {
    console.error("License validation error:", error)
    return {
      statusCode: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        valid: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as ValidateResponse),
    }
  }
}
