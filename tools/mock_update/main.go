package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
)

// Response matches the structure expected by pkg/updater
type Release struct {
	TagName string  `json:"tag_name"`
	Body    string  `json:"body"`
	Assets  []Asset `json:"assets"`
}

type Asset struct {
	Name               string `json:"name"`
	BrowserDownloadUrl string `json:"browser_download_url"`
}

func main() {
	port := "8080"

	// Create a dummy update file if it doesn't exist
	if _, err := os.Stat("update.exe"); os.IsNotExist(err) {
		fmt.Println("No 'update.exe' found. Creating a dummy one (copying self)...")
		input, err := os.ReadFile(os.Args[0]) // Copy this tool as binary
		if err == nil {
			os.WriteFile("update.exe", input, 0755)
		} else {
			os.WriteFile("update.exe", []byte("dummy binary content"), 0755)
		}
	}

	http.HandleFunc("/latest", func(w http.ResponseWriter, r *http.Request) {
		log.Println("Received update check request")
		w.Header().Set("Content-Type", "application/json")

		rel := Release{
			TagName: "v9.9.9", // Force update
			Body:    "# Mock Update\n\n- Verified local update flow.\n- It works!",
			Assets: []Asset{
				{
					Name:               "YAVAM.exe",
					BrowserDownloadUrl: fmt.Sprintf("http://localhost:%s/download/update.exe", port),
				},
			},
		}

		json.NewEncoder(w).Encode(rel)
	})

	http.HandleFunc("/download/", func(w http.ResponseWriter, r *http.Request) {
		log.Println("Received download request")
		http.ServeFile(w, r, "update.exe") // Serve the dummy file
	})

	fmt.Printf("Mock Update Server running on http://localhost:%s\n", port)
	fmt.Printf("1. Run your app with: Set YAVAM_UPDATE_URL=http://localhost:%s/latest\n", port)
	fmt.Printf("2. Press Check for Updates\n")
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
